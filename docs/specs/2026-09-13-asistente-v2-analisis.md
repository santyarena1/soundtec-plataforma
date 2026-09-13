# Asistente de productos v2 — análisis y rediseño

Fecha: 2026-09-13. Punto de partida: fase 1 en producción (commit `08a8b61`), modelo `gpt-4o-mini`,
una llamada por consulta, ~1.800 tokens de entrada y ~175 de salida por respuesta con modelo.

---

## 1. El problema, medido en producción

Conteos del catálogo público (`/catalogo?q=…&oos=1`) contra lo que respondía el asistente:

| Consulta | Productos reales | Lo que listaba |
|---|---|---|
| Compatibles con Crestron Home | ~295 | 4 |
| "outdoor" en la ficha | 269 | 2 a 8 |
| "IP66" en la ficha | 5 | — |
| "ceiling" / "in-ceiling" | 502 / 423 | hasta 8 |
| Productos activos | 2.905 | — |

El modelo no era el límite. Lo eran cuatro cosas:

1. **Topes de contexto.** Máximo 10 fichas y 6.000 caracteres. Toda consulta de catálogo se cortaba ahí,
   sin siquiera saber cuántos productos cumplían.
2. **"Exterior" no existía como dato.** Se adivinaba buscando "outdoor" en el HTML del fabricante, que
   nombra esa palabra incluso para negarla ("not for outdoor use"). El grado IP estaba declarado en
   especificaciones en solo 11 productos.
3. **Idioma.** Fichas en inglés, preguntas en español, y como puente un diccionario a mano de ~90
   entradas. Cualquier concepto fuera del diccionario no encontraba nada.
4. **El dato crudo del portal (`sourceMetadata`) no se usaba** ni para buscar ni para responder.

---

## 2. La decisión de diseño

**Precomputar una vez por producto todo lo que antes se adivinaba en cada pregunta.**

La inteligencia se gasta una sola vez, offline y en lote. La consulta queda determinística donde puede
serlo, y el modelo se reserva para lo único que no se puede resolver con una consulta SQL: criterio.

---

## 3. Lo construido

### 3.1 Perfil de producto (`ProductAiProfile`)

Tabla aditiva, una fila por producto. Se llena leyendo la ficha completa: nombre, categoría del
fabricante, descripciones, características, especificaciones, el HTML enriquecido y el dato crudo del
portal.

| Campo | Para qué sirve |
|---|---|
| `productType` | 17 tipos canónicos (speaker, amplifier, touchpanel…) |
| `environment` + `environmentEvidence` | interior / exterior / ambos, con la frase textual que lo justifica |
| `ipRating` | grado de protección normalizado |
| `mountTypes[]` | embutir en techo, en pared, rack, jardín, poste… |
| `audioLine` | 70 V, 100 V, ambas, baja impedancia |
| `powerWatts`, `impedanceOhms`, `hdmiInputs` | datos duros para comparar |
| `ecosystems[]` | Crestron Home, Dante, AES67, PoE, Sonos… |
| `applications[]` | restaurante, hotel, oficina, auditorio… |
| `summaryEs` | 2-3 oraciones en español: la ficha compacta que ve el modelo |
| `searchTextEs` | keywords en español e inglés, reemplaza al diccionario a mano |
| `embedding` | vector de 256 dimensiones para búsqueda por significado |
| `sourceHash` | si la ficha no cambió, no se vuelve a gastar un token |

**El grado IP, la línea de audio, la potencia, la impedancia, el montaje y los ecosistemas se leen con
expresiones regulares sobre la ficha, no los decide el modelo** (`profile/source.ts`). El modelo solo
aporta lo que requiere criterio: clasificar el tipo, decidir el ambiente con su evidencia, resumir y
proponer keywords. Todo lo que devuelve se filtra contra el vocabulario canónico (`profile/vocab.ts`):
un valor inventado se descarta, no se guarda.

Costo del pase completo sobre 2.905 productos: aproximadamente **USD 1** con `gpt-4o-mini`
(unos 4,4 M tokens de entrada y 0,7 M de salida) más USD 0,03 de embeddings. Después solo se reprocesa
lo que cambió.

**Panel**: `/admin/assistant/profiles`. Procesa en tandas de 20 encadenadas desde el navegador, muestra
cobertura, costo real de la corrida y qué se pudo determinar. Se puede detener y retomar.

### 3.2 Filtro canónico (`facets.ts`)

La pregunta se traduce a un filtro estructurado, con expresiones regulares y **cero tokens**:

```
"parlantes de embutir en techo para exterior con 70V"
→ { productType: speaker, mountTypes: [in-ceiling], environment: OUTDOOR, audioLine: 70V }
```

El filtro **vive en la sesión**. Un seguimiento lo refina en vez de empezar de cero: "¿y con 70V?"
conserva "parlantes de exterior" y agrega la línea. Pedir un grado IP implica exterior automáticamente.

### 3.3 Búsqueda por facetas (`facet-search.ts`)

Consulta sobre columnas, no sobre texto. Devuelve **el conjunto completo con su total** y pagina.

- "exterior" acepta también los que declaran interior y exterior.
- "70V" acepta los de doble línea.
- Crestron Home vale tanto por el perfil como por la columna del producto que carga el enriquecimiento
  del fabricante.
- **Relajación acotada**: si no hay resultados se sueltan, en orden, los términos sueltos, la aplicación
  y el montaje, y la respuesta lo dice. Nunca se suelta el tipo de producto, el ambiente, el grado IP,
  la línea de audio ni el ecosistema: eso es exactamente lo que se pidió, y responder otra cosa sin
  avisar sería mentir.
- **Desempate semántico**: cuando hay más resultados que los que entran y la pregunta tiene matices que
  las facetas no capturan, se ordena por cercanía del embedding. Corre en Node sobre el subconjunto ya
  filtrado, así que **no hace falta pgvector**; si mañana está disponible, el mismo vector sirve.

### 3.4 Modo listado (`listing.ts`) — 0 tokens

Una consulta de catálogo no necesita criterio, necesita datos. El backend ya sabe cuántos hay y cuáles
son, así que la respuesta se redacta sin modelo:

```
Tengo 83 parlantes para exterior en el catálogo. Te muestro 8:

- **Sonance PS-S43T** — declara IP66 · línea 70V
- …

Quedan 75 más. Pedime «mostrame más» y sigo.
```

Cada producto va con la evidencia que lo justifica, sacada del perfil. "Mostrame más" continúa la misma
búsqueda usando el filtro y el desplazamiento guardados en la sesión, sin volver a consultar el modelo
y sin cambios en la interfaz del chat.

Una recomendación ("necesito parlantes para un bar") **no** se lista: ahí sí hace falta criterio y va
al modelo, pero con candidatos elegidos por facetas y ordenados semánticamente.

### 3.5 Ahorro de tokens

- **Prefijo cacheable**: las instrucciones por tipo de consulta se movieron al prompt fijo, que ahora
  supera el umbral desde el que OpenAI cachea el prefijo con 50 % de descuento. La parte variable del
  mensaje se achicó.
- **Fichas compactas**: el `summaryEs` reemplaza al HTML del fabricante truncado. Menos caracteres y
  más señal, en español.
- **Línea de clasificación**: el modelo recibe las facetas ya resueltas en vez de tener que deducirlas.
- **Listados sin modelo**: las consultas más frecuentes en una feria pasan a costar 0 tokens.

Estimación: de ~1.800 tokens de entrada por consulta a ~900-1.100 en modo razonamiento, con la mitad del
prefijo cacheado, y 0 en modo listado. Con un mix de 60 % listados y 40 % razonamiento, **el gasto medio
por consulta baja entre 60 y 70 %**.

---

## 4. Arquitectura resultante

```
pregunta
  │
  ├─ análisis determinístico (0 tokens): modelo, marca, intención, atributo
  ├─ filtro canónico (0 tokens) ── se refina con el de la sesión
  │
  ├─ 1. LISTADO POR FACETAS (0 tokens)
  │     consulta de catálogo + filtro con condiciones → total + página + evidencia
  │
  ├─ 2. ATAJO DETERMINÍSTICO (0 tokens)
  │     un producto claro + un atributo reconocido → la fila de la ficha
  │
  └─ 3. UNA llamada al modelo
        candidatos por facetas (o por texto, como respaldo) → fichas compactas
```

La búsqueda por texto anterior sigue viva como respaldo: si el perfil todavía no cubre el catálogo
(menos del 25 %) o las facetas no encuentran nada, se usa el camino viejo. La transición no rompe nada.

---

## 5. Resultado medido en producción (2026-09-13)

Pase completo de perfiles: **2.905 de 2.905 productos, 0 errores**, 6,2 M tokens de entrada y
0,55 M de salida, **USD 1,26** en total y alrededor de 75 minutos. Ambiente determinado:

| Ambiente | Productos |
|---|---|
| Interior | 1.940 |
| Exterior | 294 |
| Interior y exterior | 144 |
| Sin determinar | 527 |

Los 527 sin determinar son en su mayoría accesorios, soportes y cables: productos que
efectivamente pueden ir en cualquier lado. Es la respuesta correcta, no una falta de dato.

Comportamiento del asistente, antes y después:

| Consulta | Antes | Ahora | Tokens | Tiempo |
|---|---|---|---|---|
| Parlantes para exterior | 2 a 8 productos | **153**, con evidencia por producto | 0 | 0,3 s |
| Compatibles con Crestron Home | 4 | **29** reales, no los 295 que mencionaban la frase | 0 | 0,9 s |
| Parlantes de embutir en techo | hasta 8 | **98** | 0 | 0,3 s |
| «Y cuáles admiten 70V» | rehacía la búsqueda | refina a **18** sobre los 153 anteriores | 0 | 0,04 s |
| «Mostrame más» | no existía | continúa: van 16 de 153 | 0 | 0,03 s |
| Comparar CP4 y CP4N | tabla | tabla (sigue yendo al modelo) | ~1.900 | 3,2 s |
| Recomendación para un restaurante | lista genérica | candidatos por facetas + criterio del modelo | ~1.500 | 2,4 s |

El costo interno sigue invisible en público: pedirlo diciéndose parte del equipo devuelve una
negativa, y desde el admin el mismo asistente responde costo y stock.

### Defectos encontrados midiendo, y corregidos

Cada uno apareció probando contra el catálogo real, no razonando sobre el código:

1. **42 de los primeros 43 productos quedaban sin ambiente.** El prompt exigía una cita textual,
   y un procesador de rack no dice «para interior» en ninguna frase. Se separó la decisión de su
   respaldo (declarado o deducido).
2. **«Reprocesar todo» no avanzaba**: cada tanda tomaba los mismos 20 productos. Se versionó el
   extractor.
3. **«¿Qué parlantes tienen para exterior?» se clasificaba como consulta de una especificación**
   por la palabra «tienen», y «compatibles con…» quedaba excluida del listado.
4. **El filtro se pisaba a sí mismo**: «parlantes» viajaba como tipo de producto y además como
   texto a buscar, lo que dejaba afuera todo producto cuya ficha dice «speaker». Devolvía 5 de 153.
5. **Nombrar un ecosistema restringía la marca**: «compatible con Crestron Home» exigía además
   que el producto fuera de Crestron.
6. **Un producto mostraba como evidencia el texto de ejemplo del prompt**, que el modelo copió.
   Se descarta al validar y se limpió la fila afectada sin gastar tokens.
7. **Los verbos de la pregunta ensuciaban la búsqueda** y obligaban a relajar condiciones,
   con una explicación que sobraba delante de un resultado correcto.

## 6. Qué falta

1. **Correr el pase de perfiles en producción** desde `/admin/assistant/profiles`. Hasta que la
   cobertura pase el 25 %, el asistente sigue respondiendo con el camino anterior.
2. **Fase 2 original**: leer los PDF (`ProductDocument` + chunks + embeddings). Reusa la misma
   infraestructura de vectores que ya quedó armada.
3. **Middleware**: cuando se commitee la autenticación global de `/api/*`, agregar
   `/^\/api\/expo(?:\/|$)/` a `PUBLIC_API` o el chat público deja de funcionar.
4. Verificar pgvector en producción (`SELECT * FROM pg_available_extensions WHERE name = 'vector'`) si
   el catálogo crece por encima de los ~400 productos por consulta filtrada.

---

## 7. Otros cambios de esta sesión

- `/admin/assistant/leads` y `/admin/assistant/leads/[id]`: sesiones, datos de contacto, productos
  consultados, uso de tokens, conversación completa y las preguntas que no se pudieron responder.
- Acceso al asistente desde el catálogo del portal (Modo cliente): `/expo?from=portal` no pide datos de
  contacto y vuelve a `/portal/products`.
