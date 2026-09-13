# Asistente de productos v2 — análisis de capacidad y costo

Fecha: 2026-09-13. Estado de partida: fase 1 en producción (commit `08a8b61`), modelo `gpt-4o-mini`,
una llamada por consulta, ~1.800 tokens de entrada y ~175 de salida por respuesta con modelo.

## 1. Qué se midió en producción

Conteos del catálogo público (`/catalogo?q=…&oos=1`, búsqueda por contenido) y respuestas reales
del asistente (`POST /api/expo/chat`, scope público):

| Medición | Valor |
|---|---|
| Productos activos en el catálogo | 2.905 |
| Productos cuyo texto contiene "crestron home" | 295 |
| Productos que el asistente lista para "¿compatibles con Crestron Home?" | 4 |
| Productos cuyo texto contiene "outdoor" | 269 |
| Productos con "IP66" en el texto | 5 |
| Productos con "IP65" en el texto | 6 |
| Productos con "weather" en el texto | 83 |
| Productos que el asistente lista para "listame todos los parlantes de exterior" | 2 |
| Productos con "ceiling" / "in-ceiling" | 502 / 423 |
| Productos con "70V" | 33 |

Conclusión: el problema no es el modelo, es lo que el modelo ve. La respuesta se arma sobre
como máximo 10 fichas (`MAX_CANDIDATES`) y 6.000 caracteres (`maxContextChars`), así que una
consulta cuyo resultado real son 80 o 300 productos se responde con 2 a 8.

## 2. Diagnóstico por capa

### 2.1 Retrieval (la capa que limita)

- **Topes duros.** `candidateFetchCap` 24 (48 en búsqueda por concepto), `MAX_CANDIDATES` 10,
  `wantsList` 8, `requestedCount` +2. Todo listado se corta ahí.
- **Filtro estructurado solo para Crestron Home**, y además la búsqueda por concepto sigue
  exigiendo que el producto también matchee los términos de la pregunta ("productos",
  "compatibles"): por eso devuelve 4 y no los ~295 con el booleano `isCrestronHomeCompatible`.
- **"Exterior" no existe como dato.** Se infiere por texto: "outdoor" aparece en 269 fichas
  (muchas para negarlo), pero el grado IP está declarado en specs solo en ~11 productos. No hay
  ninguna columna que diga "apto para exterior", así que cada consulta vuelve a adivinarlo con
  `contains` sobre HTML.
- **Idioma.** Las fichas están en inglés y la pregunta en español. El puente es un diccionario
  a mano (`synonyms.ts`, ~90 entradas). Cualquier concepto fuera del diccionario no matchea.
- **Sin búsqueda semántica.** "parlante para un bar con música de fondo" solo funciona si
  "bar" y "restaurant" están en el diccionario y en la ficha.
- **`sourceMetadata` (raw del portal) no se usa.** Es una columna JSON con lo que devolvió
  Sonance/Crestron/SoundTube antes de normalizar; hoy no participa ni en búsqueda ni en contexto.

### 2.2 Contexto y prompt (la capa que gasta)

- **System prompt ~900 tokens** fijos en cada llamada. OpenAI cachea prefijos ≥1.024 tokens
  automáticamente con descuento del 50 %; hoy el prefijo fijo queda justo por debajo del umbral,
  así que no se aprovecha.
- **Fichas de hasta 900 caracteres** con `Detalle:` (descripción larga / HTML) que rara vez
  aporta a la pregunta y sí come presupuesto.
- **Listados con modelo.** Para "cuáles son de exterior" el modelo redacta una lista que el
  backend ya conoce: se pagan ~2.000 tokens para enumerar.
- **Cache poco reutilizable.** La clave incluye los IDs de candidatos, así que dos preguntas
  equivalentes con un candidato distinto no comparten respuesta.

### 2.3 Capacidad conversacional

- No hay estado de "filtro actual": "¿y de esos cuáles con 70V?" vuelve a buscar de cero.
- No hay paginación de resultados ("mostrame más").
- No informa el total ("hay 83, te muestro 10").
- No lee PDFs (fase 2 pendiente).

## 3. Propuesta v2

Principio: **precomputar una vez, por producto, todo lo que hoy se adivina en cada consulta.**
La inteligencia se gasta offline (batch, barata, idempotente) y la consulta queda determinística
donde puede serlo.

### 3.1 Perfil IA por producto (`ProductAiProfile`, tabla aditiva)

Un pase batch con `gpt-4o-mini` lee, por producto: nombre, categoría, `shortDescription`,
`longDescription`, `htmlContent` (texto plano), `keyFeatures`, `specifications`, `sourceCategoryPath`,
`sourceMetadata` y relaciones. Devuelve JSON validado con zod:

| Campo | Tipo | Para qué |
|---|---|---|
| `productType` | enum (speaker, subwoofer, amplifier, processor, control, touchpanel, display, switcher, camera, mount, cable, lighting, other) | filtro por tipo |
| `environment` | `INDOOR` / `OUTDOOR` / `BOTH` / `UNKNOWN` | "de exterior" |
| `environmentEvidence` | texto corto copiado de la fuente | citar la razón |
| `ipRating` | string o null | "IP66" |
| `mountTypes[]` | in-ceiling, in-wall, surface, pendant, rack, landscape, … | "de embutir" |
| `audioLine` | `LOW_Z` / `70V` / `100V` / `BOTH` / null | "línea 70V" |
| `powerWatts`, `impedanceOhms`, `inputsHdmi`, … | numéricos | comparaciones |
| `ecosystems[]` | Crestron Home, Dante, AES67, PoE, … | compatibilidad |
| `applications[]` | restaurante, hotel, oficina, residencial, gimnasio, … | recomendación |
| `summaryEs` | 2–3 oraciones en español | ficha compacta para el prompt (≈250 chars en vez de 900) |
| `searchTextEs` | keywords en español y en inglés | búsqueda full-text sin diccionario |
| `embedding` | vector 1536 (`text-embedding-3-small`) | búsqueda semántica |
| `sourceHash`, `builtAt`, `model` | control | reprocesar solo si cambió la ficha |

Costo estimado del pase inicial (2.905 productos, ~1.500 tokens de entrada y ~250 de salida
cada uno): ≈ 4,4 M tokens de entrada + 0,7 M de salida. Con `gpt-4o-mini` son ~USD 1,10; con
Batch API (50 % de descuento, hasta 24 h) ~USD 0,55. Embeddings: ~1,5 M tokens ≈ USD 0,03.
Después solo se reprocesan los productos cuyo `sourceHash` cambió.

Se ejecuta desde el admin como los otros enriquecimientos (`/admin/sync`, con progreso y
reintentos), en lotes de 20 y con `maxDuration` de Vercel en cuenta.

### 3.2 Retrieval v2 (tres fuentes, se combinan)

1. **Filtros estructurados** sobre el perfil + columnas existentes. Sin tope: "todos los
   compatibles con Crestron Home" es `isCrestronHomeCompatible = true OR ecosystems has
   'Crestron Home'` y devuelve el conjunto completo con su total.
2. **Full-text en español** sobre `searchTextEs` + `summaryEs` (`tsvector` con índice GIN,
   diccionario `spanish`). Reemplaza el `contains` sobre HTML y el diccionario a mano.
3. **Semántica** por embedding de la pregunta (una llamada de embeddings, ~20 tokens,
   ≈ USD 0,0000004). Con pgvector: `<=>` en Postgres. Sin pgvector: se guarda el vector como
   `Float[]` y se hace el ranking en Node sobre el subconjunto que ya pasó los filtros 1 y 2
   (nunca sobre los 2.905). Primero hay que verificar
   `SELECT * FROM pg_available_extensions WHERE name = 'vector'` en la base de producción.

El análisis de intención se mantiene determinístico, pero pasa a producir un **filtro
canónico** (`{ environment: 'OUTDOOR', productType: 'speaker', audioLine: '70V' }`) además de
términos. Ese filtro se guarda en la sesión: un turno siguiente ("¿y con 70V?") lo refina en vez
de reemplazarlo.

### 3.3 Dos modos de respuesta

| Modo | Cuándo | Qué ve el modelo | Costo |
|---|---|---|---|
| **Listado** | la intención es enumerar/filtrar y el conjunto sale de filtros | nada, o una línea por producto (nombre + 3 facetas, ≈ 25 tokens c/u) para redactar una intro | 0 a ~600 tokens |
| **Razonamiento** | dato puntual, comparación, recomendación con criterio | hasta 10 fichas compactas (`summaryEs` + specs priorizadas, ≈ 350 chars c/u) | ~900 tokens de contexto |

En modo listado el backend devuelve el total y las tarjetas paginadas (10 por vez, "mostrar más"
sin tocar el modelo) y un link "ver los 83 en el catálogo" con los filtros aplicados.

### 3.4 Ahorro de tokens en la llamada al modelo

- Reordenar el mensaje para que **todo lo fijo vaya primero** (system + reglas + hints de
  intención) y superar los 1.024 tokens de prefijo: la cache de OpenAI baja ese tramo al 50 %.
- Fichas con `summaryEs` en vez de `Detalle:` truncado: ~60 % menos caracteres por producto
  con más señal.
- Historial: mandar el filtro canónico y los últimos productos en vez de 2 turnos de texto.
- Cache semántica: además de la clave exacta, reutilizar una respuesta si la pregunta tiene
  coseno ≥ 0,95 con una ya respondida y el conjunto de productos es el mismo.
- Modo listado sin modelo para las consultas de catálogo, que son las más frecuentes en una feria.

Estimación por consulta con modelo: de ~1.800 a ~900–1.100 tokens de entrada, con la mitad del
prefijo cacheado. Las consultas de listado pasan a costar 0 o ~600 tokens. Con el mix típico
(60 % listados / 40 % razonamiento) el gasto medio por consulta cae entre 60 y 70 %.

### 3.5 Modelo

`gpt-4o-mini` sigue siendo la opción de mejor costo para redactar sobre contexto cerrado.
Si se quiere más criterio en recomendaciones, probar `gpt-4.1-mini` solo en modo razonamiento
y medir con las consultas de `assistant.test.ts`; el modo listado no necesita un modelo mejor.

## 4. Orden de implementación propuesto

1. **Perfil IA por producto**: schema aditivo, servicio de extracción con zod, job por lotes
   desde el admin, verificación de pgvector. (Es lo que desbloquea todo lo demás.)
2. **Retrieval v2** con filtros canónicos + full-text español + semántica, y el estado de filtro
   en la sesión. Tests contra las consultas medidas en §1 con los totales esperados.
3. **Modo listado** con paginación, total y link al catálogo filtrado.
4. **Contexto compacto y prefijo cacheable**; cache semántica.
5. **Fase 2 original** (PDFs → chunks → embeddings) reusa la misma infraestructura de vectores.

## 5. Hecho hoy (fuera del rediseño)

- `/admin/assistant/leads` y `/admin/assistant/leads/[id]`: sesiones, leads, conversación
  completa, preguntas sin respuesta y uso de tokens. Entrada "Leads del asistente" en CRM.
- Acceso al asistente desde el catálogo del portal (Modo cliente): `/expo?from=portal` no pide
  datos de contacto y vuelve a `/portal/products`.
