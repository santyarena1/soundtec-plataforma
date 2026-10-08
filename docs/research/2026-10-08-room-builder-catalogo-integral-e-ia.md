# Room Builder — catálogo integral, ranking e IA

**Fecha:** 2026-10-08  
**Tipo:** relevamiento de producto (sin código)  
**Decisión registrada:** las “marcas core” **no aplican como límite de producto**. El Room Builder se integra con **todo el catálogo Soundtec** (~3000 SKUs / todas las marcas activas).  
**Relacionado:**  
- [`2026-10-08-room-builder-uso-cotidiano-y-3d.md`](./2026-10-08-room-builder-uso-cotidiano-y-3d.md)  
- [`2026-10-08-room-builder-implementacion-real.md`](./2026-10-08-room-builder-implementacion-real.md)

---

## 1. Qué pediste (y cómo lo interpretamos)

No alcanza con “mostrar lo que entra en el slot”. El sistema tiene que:

1. Usar **todo el catálogo** posible (todas las marcas de la plataforma).  
2. **Filtrar** por compatibilidad real con la sala / slot / plataforma.  
3. **Ordenar y recomendar** pensando en:  
   - precio (del motor Soundtec, por cliente),  
   - mejor uso para esa tipología,  
   - mejor alcance / coverage para el tamaño de sala,  
   - stock / discontinuado,  
   - packs que suelen funcionar juntos.  
4. Poder **explicar y proponer** con un modelo de IA bueno (no solo una lista muda).

Eso cambia el diseño: el builder no es un colocador pasivo; es un **motor de recomendación de diseño AV** encima del catálogo integral.

---

## 2. Decisión: catálogo integral (todas las marcas)

| Antes (borrador) | Ahora (decidido) |
| --- | --- |
| Enrich / builder priorizando “marcas core” | **Objetivo = 100% del catálogo activo** |
| Soft-filter fuerte por marca preferida | Marca es un criterio de ranking, no un muro |
| Subconjunto “room-builder ready” permanente | Todo SKU puede participar; la profundidad de datos varía |

### Matiz operativo (importante, no contradice lo integral)

“Integral” es el **alcance del producto**.  
El **batch de enriquecimiento** igual se corre por oleadas (todas las marcas, en tandas), porque 3000 datasheets no se procesan en un click. Eso no significa que el builder ignore marcas: significa que:

- Mientras un SKU aún no tiene perfil completo, igual puede aparecer en ranking con datos parciales (precio + rol AI + dims si hay).  
- Cuando el perfil está rico (FOV, coverage…), sube en calidad de recomendación.  
- Ninguna marca queda excluida del diseño del sistema.

---

## 3. Capas de inteligencia (cómo “piensa”)

No es solo un LLM suelto. Es un stack en tres capas — así se comporta como producto serio:

```
Capa 1 — HARD FILTER (determinístico)
  ¿Puede ir acá? sí/no
  rol, montaje, plataforma, discontinuado, visibilidad cliente,
  dims mínimas, políticas de tipología

Capa 2 — SCORE / RANK (determinístico + pesos)
  ordena los compatibles por utilidad real
  precio, fit de coverage, stock, preferencias, históricos

Capa 3 — IA (LLM bueno)
  propone packs, explica “por qué este”, sugiere upgrades/downgrades,
  completa brief → layout, reescribe justificación para la COT
```

### Por qué así

- Si solo usás IA: inventa compatibilidades y precios.  
- Si solo usás filtros: “sirve / no sirve”, sin “cuál es mejor”.  
- Juntas: **compatible + mejor opción + explicación**.

La plataforma ya tiene piezas cercanas: `pricing.ts`, `ProductAiProfile`, orquestador de cotizaciones (`BUILD_FROM_BRIEF`), sugerencias por patrones históricos. El Room Builder las reutiliza y agrega score espacial.

---

## 4. Capa 1 — Compatibilidad (todo el catálogo)

Para cada slot / acción “agregar producto”:

**Entran al pool** todos los `Product` activos visibles para el usuario/cliente.

**Salen del pool** (hard no):

- rol incompatible (mic en slot de display),  
- montaje imposible (rack-only en techo),  
- plataforma incompatible (si el pack Teams lo exige),  
- `isDiscontinued` (o solo warning según setting),  
- reglas de visibilidad del cliente,  
- sin ninguna representación usable (ni dims ni proxy ni rol) → opcionalmente “solo consulta”, no colocable.

Resultado: lista **compatible**. Todavía sin ordenar por calidad.

---

## 5. Capa 2 — Ranking (“mejor / peor”)

Cada candidato compatible recibe un **score** (0–100) con factores configurables:

| Factor | Qué mide | Fuente de datos |
| --- | --- | --- |
| **Fit de alcance** | ¿Cubre bien esta sala? (FOV vs ancho, viewing distance vs profundidad, mic radius vs mesa) | `ProductDesignProfile` + medidas de escena |
| **Precio** | Más barato / mejor valor / tope de presupuesto | `pricing.ts` por `clientId` |
| **Uso tipológico** | ¿Es habitual en boardroom / aula / hotel? | reglas tipología + `ProductAiProfile.applications` + históricos de COT |
| **Disponibilidad** | Stock / lead time | sync (Xtrabone, etc.) |
| **Completitud de datos** | Confianza del perfil (mejor recomendación si hay FOV real) | `completenessScore` / `confidenceScore` |
| **Ecosistema** | Dante, Crestron Home, PoE, etc. alineado al proyecto | `ProductAiProfile.ecosystems` |
| **Accesorios listos** | Tiene mount/cable en catálogo | `AccessoryRelation` |
| **Preferencia comercial** | Marca/línea que Soundtec quiere empujar (peso, no veto) | config admin |
| **Historial** | Qué se cotizó junto en proyectos parecidos | quote history / patterns |

### Modos de orden que el usuario elige

En el panel del slot:

- **Recomendado** (score compuesto default)  
- **Menor precio**  
- **Mayor cobertura / alcance**  
- **Mejor stock**  
- **Premium / top de línea**  

Así “piensa”, pero el vendedor manda.

### Ejemplo cotidiano

Slot **Cámara** en boardroom 6×4 m, Teams:

1. Filtra 80 cámaras del catálogo → quedan 18 compatibles.  
2. Rank:  
   - A cubre justo el ancho de mesa, precio medio, en stock → **#1**  
   - B más barata pero FOV corto → **#4** (warning “alcance justo / insuficiente en bordes”)  
   - C cara, cobertura de más → **#2** “upgrade”  
3. IA explica en una frase: “A equilibra cobertura de la mesa y precio para este cliente; C si querés margen de sala más ancha.”

---

## 6. Capa 3 — IA (modelo bueno)

### Qué sí hace la IA

| Capacidad | Comportamiento |
| --- | --- |
| **Armar pack inicial** | Dada tipología + m² + plataforma + presupuesto opcional → propone set de SKUs (usando capas 1–2, no inventando precios) |
| **Explicar ranking** | “Por qué este y no el otro” en español claro |
| **Upgrade / ahorro** | “Si bajás 15% el presupuesto, este display; si el cliente pide premium, este” |
| **Completar gaps** | Sugiere accesorios e instalación típica |
| **Brief libre** | Texto del vendedor (“aula de 40 alumnos, Zoom, techo bajo”) → template + picks |
| **Texto para COT** | Criterios de diseño / justificación técnica del layout |

### Qué no hace la IA

- No inventa FOV ni dims si no están en perfil/evidencia.  
- No pisa el motor de precios.  
- No declara compatible lo que la capa 1 rechazó (salvo override humano explícito).  
- No reemplaza la aprobación de datos de enrich.

### Modelo

- Configurable en admin (como hoy `openai.model` / chat model).  
- Para ranking numérico: **no hace falta LLM** (score).  
- Para explicación y packs: **sí, modelo bueno** (más capaz que el mini de tareas baratas).  
- Se puede separar: modelo barato para extract de datasheets; modelo fuerte para recomendación de sala.

Reuso natural: patrones del `quote-orchestrator` + asistente de productos, anclados a catálogo y profiles.

---

## 7. Enrich de las 3000 — cómo queda con “todas las marcas”

### Objetivo

Correr el motor de diseño sobre **todo el catálogo activo**, sin exclusión de marca.

### Oleadas (operación, no discriminación de producto)

| Oleada | Contenido | Meta |
| --- | --- | --- |
| 1 | Todos los SKUs con rol AV crítico (camera, mic, display, touch, codec, speaker) **de cualquier marca** | Ranking con fit de alcance usable |
| 2 | Resto del catálogo (accesorios, infrastructure, lighting, etc.) | Colocables / BOM / packs |
| 3 | Re-enrich de gaps + review de low-confidence | Subir calidad del score |

Así el sistema es integral desde el diseño, y el batch es manejable.

### Impacto en ranking

Un producto de una marca “chica” del catálogo **compite de igual a igual** si:

- es compatible,  
- tiene buen precio,  
- cubre mejor la sala,  
- está en stock.

La marca preferida solo suma peso si ustedes lo configuran — no es un filtro oculto.

---

## 8. UX cotidiana con inteligencia (actualización)

### Al abrir un slot

```
Compatible (18)
───────────────
Orden: [Recomendado ▾]

1. Camera X  ·  $1.240  ·  cobertura óptima  ·  stock OK
2. Camera Y  ·  $1.890  ·  upgrade alcance  ·  stock OK
3. Camera Z  ·  $980    ·  justo de FOV     ·  ⚠ bordes

[Por qué #1?]  ← IA explica
[Proponer pack completo de la sala]  ← IA + score
```

### Al pedir “armar sala sola”

1. Tipología + m² + plataforma + presupuesto opcional.  
2. Capas 1–2 eligen candidatos.  
3. IA arma el pack y lo deja editable.  
4. Todo va a escena 3D + BOM + (opcional) cotización.

### Proyectos modelo inteligentes

Los modelos públicos/equipo pueden guardar no solo el layout, sino la **política de ranking** (“priorizar precio”, “priorizar Crestron”, “priorizar cobertura”). Al duplicar, se recalcula con precios actuales del cliente.

---

## 9. Pendientes que siguen abiertos (P1 cerrado)

### Cerrado
- [x] **P1** Marcas: **todas / catálogo integral**

### Siguen pendientes

| # | Tema |
| --- | --- |
| P2 | ¿Coverage con `auto` + disclaimer o review humano obligatorio? |
| P3 | Fuentes del enrich (solo oficiales vs Google amplio) |
| P4 | SKU sin datasheet: inferred vs ocultar del score de alcance |
| P5 | Cuotas Serper + modelo fuerte de IA (cuál y techo) |
| P6 | Quién aprueba perfiles / pesos de ranking comercial |
| R1 | Pesos default del score (precio vs cobertura vs stock) |
| R2 | ¿El cliente portal ve ranking completo o solo “recomendado Soundtec”? |
| R3 | Presupuesto opcional en el wizard: ¿sí en v1? |
| I1 | Conteo real por marca (para planificar oleadas del enrich) |
| I2 | Datasheets oro multi-marca (no solo Crestron) |
| I3 | Tipologías primer release |
| I4 | Plataformas UC/Home |

---

## 10. Implicación clara

| Idea | Realidad de diseño |
| --- | --- |
| “Solo lo que sirve” | Insuficiente → es la capa 1 |
| “Qué es mejor / peor” | Capa 2 (score sobre **todo** el catálogo compatible) |
| “Que piense” | Capa 3 (IA sobre candidatos ya filtrados y valuados) |
| “Todas las marcas” | Alcance integral; enrich por oleadas; ranking sin gueto de marca |

**Sin código todavía.** Con esto el relevamiento deja de hablar de “marcas core” como límite de producto y pasa a un Room Builder **integral + recomendador**.

Cuando cierren P2, P5, R1 e I3, se puede bajar a implementación empezando por: enrich oleada 1 (roles AV de todo el catálogo) + score de slot + explicación IA.
