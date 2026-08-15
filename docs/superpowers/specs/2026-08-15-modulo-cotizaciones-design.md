# Soundtec — Diseño del módulo de Cotizaciones

> Contrato de producto e implementación. No es la spec de 130 puntos de Claude Code: es lo decidido con las COT reales y con este hilo.  
> Fecha: 2026-08-15.

## North star

Un presupuestador arma una propuesta técnico-comercial en la plataforma y emite un documento que se reconoce como Soundtec (no como plantilla de IA). La IA es **asistente / copiloto / sugeridor**: puede armar el borrador desde cero, pero cada pieza se puede rehacer con una instrucción o a mano. El criterio humano manda. El sistema elimina el copiar/pegar.

La fuente de verdad es el **proyecto de cotización estructurado**. PDF, Word y Excel son representaciones. Una COT emitida no se recalcula.

Este módulo **no** se acopla a `CustomerRequest` (solicitudes/órdenes del portal). Los envíos automáticos quedan fuera de este build; la arquitectura no debe impedirlos después.

---

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Alcance | Módulo completo de una vez: modelo, editor, documento, exportaciones, permisos, biblioteca, **orquestación de IA (agentes/capacidades), Serper, generación de imágenes, análisis multimodal, patrones históricos**. No un MVP que después hay que romper. |
| Número | Al **crear** el borrador. Correlativo. Plantilla en configuración: prefijo, si lleva fecha, tipo de fecha, número. Valor inicial configurable. |
| Salidas | PDF (oficial, preview fiel) + Word + Excel. Al finalizar se elige qué descargar. |
| Identidad | Una sola marca Soundtec (logo, azul, pie, ISO, marcas). Tres layouts: compacto / estándar / editorial. Perfiles de contenido aparte. Default en configuración; override por COT. |
| Entrega | Columna opcional (perfil o COT). Vocabulario en configuración. Antes de emitir, paso de revisión fila a fila. |
| IVA | Default 21%. Override por ítem en el mismo paso de revisión que la entrega. |
| Portal / solicitudes | No. |
| Aprobación | Configurable por permisos. `ADMIN` emite. Un vendedor puede tener o no permiso de emitir sin consulta. |
| Visibilidad | `ADMIN` ve cotizaciones de **cualquier** usuario, incluidos otros admin. El resto, las propias salvo permiso de ver todas. |
| Condiciones | Campos/textos de empresa, no se escriben de cero. Si ese cliente las cambió en la COT anterior: preguntar anteriores / sistema / nuevas. |
| Firma | Según perfil de usuario (nombre y cargo). |
| Históricos | **`Planillas de Cotizacion 5.0.xlsx` es la memoria principal** de “qué se cotizó junto” (compatibilidades de uso, no de catálogo de precios). Las COT Word/PDF suman narrativa. No se usa el Excel como pantalla de trabajo ni se reutilizan esos precios. |
| Alternativas | El modelo las soporta. Por configuración de empresa y por COT se activa o no el modo alternativas. También hay ítems opcionales dentro de una solución. |
| Precios | Solo `src/lib/pricing.ts`. La IA no calcula ni inventa precios. Override humano queda marcado. |
| Snapshot | Al emitir se congela todo. Nueva versión = recálculo de precios, no mutar la emitida. |

---

## Lo que no es negociable (del `.md` y de las COT)

- Human-in-the-loop en decisiones técnicas y comerciales.
- Costos/márgenes nunca salen al PDF/Word/Excel de cliente.
- Texto bloqueado no se reescribe.
- Datos duros (SKU, precio, IVA, cantidad, cliente) vs texto interpretativo.
- El PDF no debe parecer generado por IA: tono Soundtec, bloques reales, sin adjetivos vacíos.
- Preview = motor del PDF. Si miente, el módulo fracasa.

---

## Numeración

Configuración (`AdminSetting` o entidad `QuoteNumberingConfig`):

- `prefix` (ej. `COT`)
- `includeDate` (sí/no)
- `dateToken` (año `YYYY`, `YY`, `YYYYMM`, fecha completa)
- `datePosition` (después del prefijo / antes del correlativo)
- `separator` (`""`, `"-"`, `"."`)
- `padding` (ej. 5 → `14543`)
- `nextSequence` (el siguiente a asignar; arranque configurable, p. ej. 14544)

Al crear: se reserva el número, se incrementa `nextSequence`. No hay agujeros salvo borrado de borrador nunca emitido (política: **no reutilizar** números, ni de borradores; más simple y auditable).

Ejemplos posibles según config:

- `COT14544`
- `COT2026-14544`
- `COT-2026-14544`

---

## Dominio

Nombres orientativos. Auditoría previa a migrar: reutilizar `Client`, `User`, `Product`, `ProductImage`, `AdminSetting`, motor de precios. **No** reutilizar `CustomerRequest` como cotización.

### Quote

- id, number, version, status
- clientId (obligatorio para precio; se puede crear el borrador y completar cliente enseguida, pero no emitir sin cliente)
- ownerId (quien la arma)
- layoutKey: `compact` \| `standard` \| `editorial`
- contentProfileId
- alternativesEnabled
- currency (default USD)
- numbering snapshot (el string ya renderizado)
- issuedAt, issuedById, pdfBlobUrl, docxBlobUrl, xlsxBlobUrl
- commercialTermsSource: `system` \| `client_previous` \| `custom`

Estados: `DRAFT` → `IN_REVIEW` (si el vendedor no puede emitir) → `READY` → `ISSUED` → `SUPERSEDED` / `ARCHIVED`. Vencida se deriva de vigencia, no hace falta un job el día uno.

### QuoteAlternative

Sólo si `alternativesEnabled`. Una COT sin alternativas tiene una alternativa implícita `default` (simplifica el modelo: siempre hay ≥1 alternativa interna; la UI no la muestra si el modo está apagado).

### QuoteItem

- alternativeId
- kind: `PRODUCT` \| `SERVICE`
- productId nullable
- serviceType nullable (materiales, instalación, programación, ingeniería, …) — catálogo de tipos en configuración
- quantity, unit
- descriptionSnapshot (descripción para cotización; editable)
- unitPriceUsd, lineTotalUsd (del motor o override)
- priceOverridden
- ivaRate (default 21, override en revisión)
- deliveryKey (opción de configuración; se completa en revisión)
- optional / excluded flags
- sortOrder
- source: `manual` \| `catalog_search` \| `paste` \| `suggested` \| `historical_pattern` \| `template`

### QuoteSection (árbol documental)

- type, title, content (JSON/tip-tap o bloques estructurados, no HTML suelto como fuente)
- origin: `corporate` \| `template` \| `generated` \| `manual` \| `product` \| `project`
- status, locked, sortOrder
- dependencyKeys, stale (revisión necesaria)
- sourceBlockId + sourceBlockVersion

### QuoteAsset

Imágenes de producto, aplicación, proyecto, ISO, logos de marcas. Flag `aiGenerated` si alguna vez se genera. Caption. No presentar imagen generada como foto real.

### QuoteCommercialTerms

Campos estructurados (no un párrafo único):

- preciosEn (USD)
- referenciaPago (BNA vendedor, etc.)
- formaPago
- vigenciaDias
- plazoEntregaTexto
- garantiaProductos
- textos híbridos: instalación, personal técnico, ISO, cierre

Cada campo tiene valor + `locked`.

### QuoteBlockLibrary

Bloques institucionales versionados. Una COT emitida guarda el id+versión usados.

### ContentProfile

Qué secciones entran (resumido / técnico / premium). Independiente del layout visual.

### QuoteContext

Capa de entrada para el copiloto (no sale al PDF salvo que el usuario lo pida):

- archivos (PDF, Word, Excel, imágenes, planos, renders, pliego, mails)
- notas humanas (prioridad sobre cualquier sugerencia)
- hechos extraídos vs supuestos vs preguntas vs riesgos (nunca mezclados)
- tipo de proyecto inferido o elegido

### QuoteValidation + QuoteRevision + QuoteAiRun

Validaciones, historial, trazas de IA (sin costos ni márgenes en el prompt). Cada `QuoteAiRun` guarda: capacidad, proveedor, modelo, input hash, output estructurado, aceptación/edición/rechazo.

### HistoricalPattern (ingesta)

**Fuente principal:** `Planillas de Cotizacion 5.0.xlsx` (~277 hojas). Cada hoja con ítems reales es una cotización/proyecto (Zurich, Metlife, P&G, IBM, teatros, huddles, etc.). Las hojas `LIBRE (*)` vacías se ignoran.

Qué se extrae de cada hoja:

- nombre de proyecto (nombre de hoja)
- filas con cantidad > 0: descripción, cant, unidad, marca/modelo parseados, tipo servicio vs producto
- co-ocurrencia: productos que aparecen en la misma hoja
- cantidades típicas y accesorios que acompañan (lentes con proyector, soporte NDT con pantalla, encoder+decoder NVX, OPS con display i3)

Resolución contra el catálogo Prisma cuando el texto matchea SKU/modelo. Si no matchea, queda como nodo de texto histórico (sigue sirviendo para sugerir “buscá esto en catálogo”).

**No se importa:** precios de esa planilla como precio vigente, costos, columnas internas. El motor de `pricing.ts` manda.

Las COT Word/PDF (Salva, Image Campus, hospital) complementan: textos, secciones, fotos, no reemplazan este grafo de BOM.

Las cotizaciones nuevas emitidas en la plataforma **siguen alimentando** el mismo grafo.

---

## Permisos (encajan en `src/lib/permissions.ts`)

Scopes nuevos:

- `quotes.view_own`
- `quotes.view_all` (incluido en rol ADMIN / SUPER_ADMIN)
- `quotes.create`
- `quotes.edit`
- `quotes.issue` (emitir sin consulta)
- `quotes.submit_review` (enviar a revisión)
- `quotes.approve`
- `quotes.manage_library` (bloques, perfiles, layouts default, numeración, opciones de entrega, tipos de servicio)

Firma: campos en `User` (o settings por usuario): `quoteSignName`, `quoteSignTitle`.

Un vendedor sin `quotes.issue` genera PDF de borrador con marca de agua; el oficial lo emite quien tenga permiso.

---

## Editor (una sola aplicación, no wizard)

Pantalla principal `/admin/quotes` (listado) y `/admin/quotes/[id]` (editor).

### Listado

Buscar, filtrar estado, cliente, responsable, monto, vigencia. Duplicar. ADMIN ve todas.

### Editor — tres superficies en una

1. **Tabla (corazón operativo)**  
   Filas producto/servicio. Edición en celda, Tab, duplicar, reordenar, pegar `4 x CI4` y resolver contra catálogo. Columnas: #, cant, u, detalle, unitario, total, IVA, entrega (entrega/IVA se pueden completar masivamente en el paso pre-emisión). Subtotales por grupo si hay ambientes. Ítems opcionales claramente marcados.

2. **Documento**  
   Árbol de secciones. Editar texto, bloquear, insertar bloque de biblioteca, fichas de producto (layout editorial), imágenes. No es un Word genérico: hay estructura.

3. **Preview**  
   Páginas reales del layout elegido. Mismo HTML que el render PDF.

Selector de layout y perfil arriba. Switch “alternativas” si está habilitado a nivel empresa; si está off, no se ve.

Autosave. Concurrencia: optimistic (`updatedAt`). No hace falta OT el día uno.

### Paso “Revisar y emitir”

Antes del PDF oficial:

- cliente, número, totales
- IVA por fila (default 21, editable)
- entrega por fila (opciones de configuración) o ocultar columna
- condiciones comerciales (y el diálogo si el cliente tenía override)
- checklist corto (productos, precios, textos, preview)
- formato de descarga: PDF / Word / Excel (combinable)

---

## Documento visual

### Identidad (tokens únicos)

- Azul marino Soundtec, blanco, grises
- Logo “S” + SOUNDTEC + “integramos tecnología”
- Pie: Av. Donato Álvarez 1526, teléfono, mail, web
- ISO IRAM / IQNet
- Franja de disciplinas (audio, video, iluminación, UC, control)
- Grilla de marcas: preferir **marcas usadas en la COT** + opción de mostrar el collage institucional (configurable por perfil)

### Layouts

| Key | Uso | Densidad |
|---|---|---|
| `compact` | reposición, cliente habitual | carta + tabla + condiciones |
| `standard` | mayoría | propuesta + tabla + instalación + condiciones + ISO |
| `editorial` | proyecto que se vende con explicación | fichas, fotos de aplicación, más aire, como COT14543 v2 |

No son 3 marcas distintas. Mismos tokens, distinta composición.

### Estructura tipo carta (como las COT reales)

1. Fecha y lugar  
2. Destinatario  
3. Ref + número de presupuesto  
4. Párrafo de consideración  
5. Bloques corporativos según perfil  
6. Nuestra propuesta / productos clave (si el perfil los pide)  
7. Tabla productos y servicios  
8. Condiciones de servicio / personal técnico  
9. Condiciones comerciales  
10. Garantías / ISO / cierre y firma del perfil emisor  

El layout editorial intercala fichas e imágenes **sin** inventar fotos de obra.

### Motor de render

- Fuente: árbol de secciones + ítems + assets + terms.  
- HTML/CSS tipográfico → PDF (Chromium headless o equivalente estable en el deploy actual).  
- El preview de admin usa **el mismo** HTML.  
- Word: segundo renderer desde el mismo árbol (no al revés).  
- Excel: BOM + totales + IVA + entrega; **sin** costos internos.  
- Almacenar archivos emitidos en Vercel Blob (ya usado en imágenes de producto).

Reglas de página: no huérfanos de título, tablas que continúan con encabezado repetido, pie con número de página, no cortar imágenes.

---

## Arranque desde cero (el ayudante fuerte)

La IA **tiene que poder armar una cotización casi completa** a partir de poco: un brief escrito + planos/fotos/pliego. Eso no es un chat que escupe un PDF. Es un **estudio de propuesta**: el sistema produce un borrador profesional, 100% editable, con origen en cada cosa (humano / sugerido / inferido). El presupuestador corrige y emite.

Sin este flujo, el módulo es un Word con catálogo. Con este flujo, es el producto.

### Cómo entra el usuario

Al crear COT, dos caminos (el default es el de brief):

**A — Brief de proyecto (camino principal)**  
Una sola pantalla, densa, de integrador. No un wizard de 12 pasos.

- Cliente (o “asignar después”, bloquea emitir).
- **Prompt de proyecto**: campo grande. Es *el* input. Ahí se pega el mail del arquitecto, el relevamiento, o se escribe como se le explicaría a ingeniería. Placeholder de ejemplo, no copy de IA.
- **Adjuntos**: planos (PDF/imagen; DWG si más adelante hay conversor), fotos del lugar, render, pliego, Excel, Word. Varios. Preview de cada uno.
- Chips de tipo (opcionales): audio comercial, aula híbrida, sala de reunión, auditorio, retail, outdoor, UC/Teams, otro. Si no se tocan, la IA infiere y lo deja como supuesto.
- Perfil documental + layout (con el default de configuración).
- Alternativas on/off.
- Acción principal: **Generar propuesta**.
- **Avanzado** (colapsado): metros / personas / marcas sí-no / techo de presupuesto / fecha de obra / “nada visible en cielorraso” / otras notas estructuradas. Quien sabe, las usa; quien no, no las ve.

**B — En blanco**  
Tabla vacía para quien ya sabe el BOM. El brief sigue disponible en un panel para disparar IA después.

El prompt y los archivos **no desaparecen**. Quedan en el editor como “Brief del proyecto”. Se puede ampliar el texto, sumar un plano y pedir **Actualizar propuesta** (sólo toca lo no bloqueado / no editado a mano).

### Qué tiene que salir de “Generar propuesta”

Un borrador que se sienta escrito por Soundtec, no un outline:

1. Lectura del proyecto: hechos, supuestos, preguntas, riesgos (panel interno; al PDF no va salvo que se copie a una sección).
2. Desglose por ambientes / zonas / subsistemas (video, audio, control, UC, infraestructura) si el brief lo permite.
3. BOM real del catálogo (SKU existentes) + cantidades justificadas + servicios típicos (instalación, materiales) según históricos.
4. Precios del motor para ese `Client`.
5. Árbol documental según perfil: presentación, propuesta, fichas clave, funcionalidad, tabla, condiciones de biblioteca, firma.
6. Imágenes: catálogo → Serper (pendiente de elegir) → esquema conceptual si aporta.
7. Si alternativas está on: opción “lo pedido” vs “recomendación Soundtec” cuando el brief muestra un pedido flojo (como el hospital).

Nada de esto nace `ISSUED`. Todo nace `suggested` o `inferred`. El humano puede borrar la mitad, reescribirla a mano, o **rehacer esa pieza con un prompt**.

---

## Control granular (copiloto, no piloto)

La IA puede armar **todo** el borrador. Eso no transfiere la autoría. Cada microresultado es un objeto con dueño y se puede deshacer o redirigir.

### Unidad rehacible

Cualquier cosa que la IA haya tocado tiene menú de tres vías, siempre:

1. **A mano** — editar, borrar, reemplazar por catálogo, pegar texto. Pasa a `source=manual`.
2. **Rehacer con instrucción** — prompt chico, anclado a *esa* pieza. Ejemplos: “más grave en el jardín, no cambies el interior”; “esta ficha más corta y sin SPL”; “en vez de CI5 buscá equivalente Crestron”; “esta cantidad explicala otra vez”.
3. **Fijar** — lock. Ni actualización de brief ni “regenerar propuesta” la pisan.

Ámbito del rehacer: **sólo el nodo** (fila, párrafo, imagen, supuesto, zona, alternativa), salvo que el usuario amplíe (“esto y las fichas relacionadas”). Nunca un prompt de fila reescribe la COT entera.

### Qué se puede rehacer (lista cerrada de átomos)

- un ítem (producto o servicio): modelo, cantidad, descripción de cotización
- un grupo / ambiente / subsistema
- una sección o un párrafo
- una imagen o su pie
- un supuesto, una pregunta, un riesgo del análisis
- una condición comercial (sin inventar descuentos; el precio unitario sigue el motor o override humano)
- una alternativa completa
- el BOM entero o el documento entero, **respetando locks y filas manuales**

Cada átomo guarda: `source`, `locked`, `lastInstruction`, `lastAiRunId`, `humanEditedAt`. Si el usuario rehace con prompt, la instrucción queda visible (“lo último que le pediste a esta ficha”).

### Cómo se siente

No hace falta un chat global para trabajar. En la fila o el bloque: `Editar` | `Rehacer…` | `Fijar`.  
`Rehacer…` abre un campo de una o dos líneas + contexto de esa pieza (producto, sección, notas humanas). La IA devuelve un diff; el usuario acepta o descarta.

El rail de ayudante sigue existiendo para acciones grandes (actualizar propuesta, revisar coherencia). Las microreglas se tocan **en el lugar**.

Si una reescritura chica deja stale otra sección (cambió el amplificador, el “concepto general” lo nombra), se marca stale y se ofrece rehacer *esa* sección, no se pisa sola.

### Planos (requisito, no accesorio)

Pipeline:

1. Guardar original en Blob.
2. Normalizar a imagen/PDF de trabajo.
3. Modelo de visión: ambientes, cotas si se leen, grillas, racks, displays, “acá dice aula 1”.
4. Salida estructurada: `{ spaces[], measurements[], detectedEquipment[], unknowns[] }`.
5. El asistente de solución usa eso para cantidades (parlantes, micrófonos de techo, etc.) y **explica** la cantidad.
6. El plano puede anclarse en el documento (anexo o figura) si el perfil editorial lo pide. No se redibuja el plano con IA haciéndose pasar por el original.

Si el plano no se entiende: se dice. No se inventa una planta.

DWG/DXF nativo no es obligatorio el día del schema; el diseño deja `QuoteAsset.type = plan` y un adapter `parsePlan`. PDF/PNG/JPG sí son obligatorios.

### Prompt maestro (contrato)

El brief del usuario no se manda crudo a un LLM para que “escriba una cotización”. Se convierte a un paquete:

```
QuoteBuildRequest
  clientId?
  brief: string
  humanNotes: string[]
  assets: Plan | Photo | Pliego | Other
  projectType?
  profileId
  layoutKey
  alternativesEnabled
  language: es
```

El orquestador corre, en orden, las capacidades de abajo. Cada etapa deja artefactos en `QuoteContext`. Si una etapa falla, el resto no alucina para tapar el hueco.

Política de preguntas: **mostrar las que cambian la ingeniería**, y al mismo tiempo permitir **Continuar con supuestos** (quedan pintados en el panel). No bloquear al usuario en un cuestionario.

### Actualización incremental

Si después cambia el brief o se sube otro plano:

- se recalcula impacto
- se marcan secciones `stale`
- no se pisan locked ni filas `source=manual`
- el usuario acepta el diff (agregar 2 CI5, reescribir “concepto general”)

### Barra de ayudante (siempre, no solo al crear)

En el editor, un rail sobrio (no burbujas de chat como producto):

- Generar / actualizar propuesta
- Completar esta sección
- Buscar en catálogo con lenguaje natural
- Completar accesorios que suelen ir
- Revisar coherencia
- Buscar imagen (Serper)
- Generar esquema

Puede haber un hilo de trabajo para “preguntale al proyecto”, pero **la COT no vive en el chat**. El chat, si existe, escribe sobre el modelo.

---

## Inteligencia: orquestador + capacidades (APIs / MCP)

La IA es un **ayudante de primer nivel**: casi puede armar desde 0. Lo que no puede es emitir ni mentir con cara seria.

Arquitectura: **orquestador + capacidades intercambiables**. Cada capacidad es un contrato JSON. El proveedor (OpenAI, Anthropic, Gemini, u otro vía API/MCP) es un adapter. No acoplar a `callGPT4o`. Reutilizar `src/services/openai.ts`, `src/services/serper.ts`, `getSetting` / API keys de admin, mocks si no hay clave.

Herramientas externas (MCP, vision, OCR, image gen, embeddings) entran como **adapters**, no como fuente de verdad. Catálogo, precios y cliente salen de Prisma.

Costo por token **no** recorta el módulo. Sí hay observabilidad (latencia, fallos, modelo, job). Jobs largos (planos, lote de imágenes, propuesta completa) son asíncronos: la UI muestra progreso por etapa (leyendo plano → buscando catálogo → armando tabla → redactando).

### Capacidades (agentes lógicos)

No hace falta que cada uno sea un proceso autónomo. Sí hace falta que existan como unidades separadas, con herramientas distintas, para no mezclar precio con prosa.

| Capacidad | Qué hace | Qué no hace | Herramientas |
|---|---|---|---|
| **Analizador de contexto** | Lee brief, mail, pliego, plano, fotos. Separa hechos / supuestos / preguntas / riesgos. | No arma BOM ni pone precios. | LLM multimodal, OCR/document understanding |
| **Recuperador de catálogo** | Encuentra productos, familias, accesorios, equivalencias. | No inventa SKU. Si no está en Prisma, dice “no está en catálogo”. | `getCatalog`, búsqueda, embeddings opcionales |
| **Patrones históricos** | “Cuando se cotizó A, casi siempre iba B”. | No copia precios viejos. | Corpus ingerido de COT reales |
| **Asistente de solución** | Propone arquitectura por ambientes/subsistemas, justifica, detecta huecos. | No pisa ítems marcados como elección humana. | Catálogo + notas + hechos |
| **Validador técnico** | Reglas en código (canales, cantidades) + semántica (¿esto cierra con el objetivo?). Estados: validado / probable / no validable / inconsistente. | No afirma compatibilidad sin evidencia. | Specs de producto, grafo de solución cuando exista |
| **Redactor técnico** | Propuesta, fichas, funcionalidad, criterios. Tono Soundtec (como COT14543), no brochure. | No afirma PoE/Dante/W si no hay fuente. Grounding obligatorio. | Ítems aprobados, fichas, notas |
| **Editor comercial** | Claridad, orden, consistencia con condiciones estructuradas. | No inventa vigencia, forma de pago ni descuentos. | `QuoteCommercialTerms` |
| **Curador visual** | Elige foto de catálogo; si falta, **Serper**; si hace falta comunicar una idea, **genera** imagen conceptual. Sugiere dónde va. | No hace pasar una imagen generada por instalación real. Leyenda “Imagen conceptual” cuando aplique. | `ProductImage`, Serper, generador |
| **Auditor final** | Compara proyecto, BOM, textos, imágenes, condiciones, totales. Busca contradicciones (“el texto dice 8 zonas, el amplificador tiene 4”). | No emite. Solo lista errores/advertencias. | Árbol + ítems + terms |

Hay un **orquestador de propuesta** (`buildQuoteFromBrief`) que encadena esas capacidades para el arranque desde cero. El mismo set se invoca **por átomo** (`reviseQuoteNode`) cuando el usuario dice “rehacer esto con esta instrucción”. No hay “regenerar todo” que pise bloques locked ni filas `manual`.

### Contexto y archivos

El presupuestador vuelca lo que tiene: texto libre, PDF, Word, Excel, imágenes, planos, renders, pliego. Queda en `QuoteContext`, trazable. El analizador no convierte supuestos en hechos. Pregunta sólo cuando la ausencia cambia la ingeniería (altura de cielorraso, PoE, etc.).

Notas humanas ganan siempre (“este cliente prefiere Crestron”, “no ofrecer Bose”).

### Serper (ya existe en el repo)

Reusar `searchProductImages` y `searchWeb`.

Uso en cotizaciones:

- foto de producto o de aplicación cuando el catálogo no tiene una usable para la COT
- el usuario **elige** entre resultados; no se inserta sola en el PDF
- la elegida se copia a Blob (`QuoteAsset`) para que la COT emitida no dependa de un URL ajeno que mañana muere
- búsqueda web de ficha/manual sólo como evidencia interna, no para citar URLs dudosas en el documento cliente

Sin API key: mismo fallback mock que el resto de la plataforma, y la UI no rompe.

### Generación de imágenes

Capacidad propia (`generateConceptualImage`), proveedor configurable (OpenAI Images u otro adapter).

Cuándo sí:

- esquema simple de zonas / idea de layout
- visual de ambiente **conceptual** si no hay render del cliente
- diagramas de señal a futuro (puede ser SVG generado por reglas, no solo diffusion)

Cuándo no:

- rellenar espacio
- fingir una obra hecha
- mostrar un modelo exacto que no es el cotizado

Toda imagen generada: `aiGenerated=true` + leyenda. El curador prioriza: 1) foto de catálogo Soundtec, 2) foto del proyecto del cliente, 3) Serper elegida por humano, 4) generación conceptual.

### Grafo de solución

Ítems no son solo filas. Relaciones opcionales (`QuoteRelation`: origen, destino, tipo, estado, evidencia). Sirve al validador y a diagramas. Si no hay grafo armado, el validador no inventa uno: marca “no validable”.

### Grounding de redacción

Cada claim técnico sale con fuentes: catálogo, spec, documento adjunto, nota humana. Si no hay fuente, el redactor omite o marca para revisión. Conflicto catálogo vs manual → no elegir solo: marcar conflicto.

Prompts con contrato, no prosa suelta:

```
generateProposalSection(projectFacts, approvedItems, editorialPolicy, notes)
→ { draft, claims[], sources[], warnings[] }
```

Mínimo contexto: nunca `baseCostUsd`, márgenes, reglas internas, API keys.

### Proveedores

Cada tarea es `capability(context)`. Configuración: modelo por capacidad si hace falta. Cambiar OpenAI por otro no debe reescribir el módulo.

Jobs largos (parsear plano, varias imágenes, auditoría): asíncronos. La UI no se congela. Si Vercel no aguanta, el diseño admite cola/worker; no se recorta la capacidad “porque serverless”.

### Históricos → modelos

Ingesta obligatoria al arrancar el módulo:

1. Parser de `Planillas de Cotizacion 5.0.xlsx` → grafo de co-ocurrencia + perfiles de uso (sala huddle, training, teatro, VC, digital signage…).
2. COT Word/PDF para tono y estructura documental.
3. Cada COT nueva emitida actualiza el grafo.

El recuperador y el asistente de solución preguntan a este grafo: “si puso AM-200, ¿qué más suele ir?”. Los precios de 2019–2025 **no** se reutilizan.

### Prohibido (capa IA)

- Inventar producto, spec, precio, plazo, stock confirmado.
- Reemplazar ítem de origen humano sin permiso explícito.
- Tocar sección bloqueada.
- Meter costos en el prompt.
- Regenerar el documento entero.
- Insertar Serper o imagen generada en el PDF sin aceptación.
- Mezclar hechos y supuestos en el texto que ve el cliente.

---

## Validaciones al emitir

**Error:** sin cliente; cantidad ≤ 0; total inconsistente; moneda faltante; ítem de producto huérfano; placeholder en texto.

**Advertencia (con registro si se ignora):** entrega vacía con columna visible; compatibilidad no verificada; condiciones distintas al estándar.

**Sugerencia:** falta imagen en ficha editorial.

---

## Integración con el repo actual

- Precios: `calculateCustomerPrice` / `calculatePricesForProducts` + `Client`.
- Auth: `requirePermission` + nuevos scopes; `requireAdmin` no alcanza porque hay vendedores.
- Settings: numeración, layouts default, opciones de entrega, alícuotas, textos de empresa, **modelos/claves por capacidad de IA**.
- IA existente: `src/services/openai.ts`, `src/services/serper.ts`, feedback en `AiContentFeedback`, API keys en `/admin/api-keys`.
- Blob: PDFs, DOCX, XLSX, assets de cotización, copias de imágenes Serper/generadas.
- UI: mismos componentes `src/components/ui`, sidebar grupo nuevo “Cotizaciones”.
- No hay motor PDF hoy: se agrega. Playwright/Chromium debe evaluarse contra el deploy Vercel (función larga o `@sparticuz/chromium`); si no entra, renderer Node (`@react-pdf/renderer`) **sólo** si el preview sigue siendo fiel. Preferencia: HTML único.

---

## Fuera de este módulo (explícito)

- Envío por mail/WhatsApp desde la plataforma.
- Aceptación online del cliente.
- Tracking de lectura.
- Vínculo con solicitudes del portal.
- Workers de scraping.
- Regenerar COT emitidas.

---

## Criterio de “está entero”

Se puede: crear COT con número según plantilla; cargar cliente; armar BOM desde catálogo y pegado; servicios; opcionales; alternativas si están on; editar/bloquear textos; biblioteca; tres layouts; condiciones con diálogo de cliente; revisar IVA/entrega; preview fiel; emitir snapshot; descargar PDF/Word/Excel; versionar/duplicar (recalcula precio); permisos vendedor vs admin; listar todas las COT si sos admin; **adjuntar contexto (archivos/notas); analizar (hechos vs supuestos); sugerir solución y accesorios por catálogo + históricos; redactar con grounding; curar imágenes (catálogo / Serper / generación conceptual); validar y auditar; todo con aceptación humana**.

Si falta una de esas piezas, no está el módulo que se pidió.
