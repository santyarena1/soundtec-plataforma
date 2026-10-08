# Room Builder Soundtec — alcance real e implementación concreta

**Fecha:** 2026-10-08  
**Tipo:** plan de implementación / alcance (sin código de producto en este PR)  
**Relacionado:**  
- [`2026-10-08-room-builder-limitaciones-alcance.md`](./2026-10-08-room-builder-limitaciones-alcance.md)  
- [`2026-10-08-soundtec-room-builder-3d-propio.md`](./2026-10-08-soundtec-room-builder-3d-propio.md)  
- [`2026-10-08-crestron-room-builder-integracion.md`](./2026-10-08-crestron-room-builder-integracion.md)  
- [`2026-10-08-room-builder-uso-cotidiano-y-3d.md`](./2026-10-08-room-builder-uso-cotidiano-y-3d.md) — uso diario, 3D, slots/compatibilidad, proyectos, pendientes  
- [`2026-10-08-room-builder-catalogo-integral-e-ia.md`](./2026-10-08-room-builder-catalogo-integral-e-ia.md) — todas las marcas, ranking precio/alcance, capa IA

**Pregunta a responder:**  
¿Se puede enriquecer ~3000 productos buscando en internet la data de diseño, armar una base, y sobre eso un Room Builder real (videoconferencia, eventos, hotel, escuela, etc.) con tamaños, m², objetos y modelado 3D con **varias vistas preset + zoom a zonas** (sin movilidad total)?

**Respuesta:** **Sí, y es implementable sobre lo que ya existe.** No es magia: son dos productos acoplados.

1. **Motor de enriquecimiento de diseño** (batch sobre el catálogo → `ProductDesignProfile`).  
2. **Room Builder** (templates de escena + viewport 3D multi-vista/zoom acotado + BOM → cotización/PDF).

---

## 1. Qué vas a tener al final (definición de “real”)

Un usuario elige:

- Tipo de espacio: videoconferencia / salón de eventos / aula / habitación de hotel / living / lobby / classroom / boardroom / huddle (lista cerrada versionada).  
- Tamaño: chico / mediano / grande **o** metros cuadrados + alto libre.  
- Plataforma UC opcional (Teams / Zoom / BYOD / Crestron Home / ninguna).  

Ve una escena 3D con **varias vistas preset** (general, frente AV, planta, detalle) y **zoom / encuadre a zonas** (slot o producto); sin orbit libre ni walk-through.  
Puede agregar/quitar objetos del catálogo Soundtec (y muebles genéricos).  
Ve cobertura estimada (cámara/mic/display) cuando el SKU tiene perfil.  
Ve BOM con precios reales.  
Genera cotización + PDF Soundtec con 2–3 renders de esas vistas.

Eso es el producto. Lo demás (movilidad 100%, VR, BIM) queda fuera a propósito.  
Detalle de cámara: [`room-builder-uso-cotidiano-y-3d.md`](./2026-10-08-room-builder-uso-cotidiano-y-3d.md) §2.3.

---

## 2. Pieza A — Motor de enriquecimiento (~3000 productos)

### 2.1 Por qué es realista en Soundtec

Ya hay infraestructura para lote masivo:

| Pieza existente | Dónde | Reuso |
| --- | --- | --- |
| Búsqueda web | `src/services/serper.ts` → `searchWeb` | Descubrir URL oficial / datasheet |
| Enrich por producto + lotes | `crestron-web` connector, SyncRun, cron | Patrón a clonar |
| Specs / docs / dims | `Product.specifications`, `documents`, `widthCm…` | Destino + materia prima |
| Clasificación IA | `ProductAiProfile` (batch 20–60) | Etapa post-enriquecimiento |
| Sync pipeline | `processBatch` / `runToCompletion` (hasta ~5000/corrida teórica) | Orquestación |
| API keys admin | `serper.api_key`, `openai.api_key` | Operación |

No hace falta inventar un scraper framework desde cero. Hay que crear un **connector nuevo** tipo `design-enrich` (o `web-datasheet`) en el registry de sync.

### 2.2 Qué busca el motor (por producto)

Input mínimo: `brand + modelNumber|manufacturerItem|normalizedName + internalSku`.

Pasos por SKU:

```
1. Fuentes propias Soundtec (verdad prioritaria)
   documents[] + specifications[] + dims + vendorProductUrl

2. Sitio oficial del fabricante (verdad canónica de enrich)
   Seguir vendorProductUrl / links en documents
   Ficha, recursos, banco de fotos, datasheet PDF del fabricante
   Guardar raw en sourceMetadata.designEnrich (+ blob PDF si aplica)

3. Extract (IA + parsers)
   - Mapear specifications tipadas ya existentes
   - PDF/HTML oficial → schema-fill ProductDesignProfile
   - Cada campo: value, unit, confidence, sourceUrl, evidence

4. Discovery opcional (NO fuente de verdad)
   Serper u otros SOLO si falta URL oficial
   Todo hallazgo debe validarse contra página oficial antes de persistir

5. Validate + Upsert
   Rangos por rol; low-confidence / missing sin inventar coverage
   No pisar precio/stock
```

Decisión de negocio: ver [`room-builder-decisiones-cerradas.md`](./2026-10-08-room-builder-decisiones-cerradas.md).

### 2.3 Schema concreto a persistir

Nuevo modelo Prisma (nombre tentativo):

```prisma
model ProductDesignProfile {
  id                 String   @id @default(cuid())
  productId          String   @unique
  product            Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  // Clasificación de diseño
  designRole         String?  // camera|mic|display|speaker|touch|codec|processor|furniture|other
  roomCategories     String[] // videoconference|classroom|hotel|event|residential|lobby...
  mountOptions       String[] // wall|ceiling|table|rack|floor
  defaultMountHeightM Decimal? @db.Decimal(6, 3)

  // Caja física (puede espejar Product.* si está curado)
  widthM             Decimal? @db.Decimal(8, 4)
  heightM            Decimal? @db.Decimal(8, 4)
  depthM             Decimal? @db.Decimal(8, 4)
  weightKg           Decimal? @db.Decimal(10, 3)

  // Cámara
  hfovDeg            Decimal? @db.Decimal(6, 2)
  vfovDeg            Decimal? @db.Decimal(6, 2)
  maxRangeM          Decimal? @db.Decimal(6, 2)

  // Mic
  micPattern         String?  // omni|cardioid|array|beam|boundary
  coverageRadiusM    Decimal? @db.Decimal(6, 2)
  coverageWidthM     Decimal? @db.Decimal(6, 2)

  // Display
  diagonalIn         Decimal? @db.Decimal(6, 2)
  viewingDistanceMinM Decimal? @db.Decimal(6, 2)
  viewingDistanceMaxM Decimal? @db.Decimal(6, 2)

  // Audio
  coverageAngleDeg   Decimal? @db.Decimal(6, 2)
  sensitivityDb      Decimal? @db.Decimal(6, 2)

  // 3D
  proxyKey           String?  // touch_10|ptz_camera|ceiling_mic|tv_65|table_rect...
  model3dUrl         String?  // GLB hero si existe
  model3dSource      String?  // proxy|artist|cad_convert|none

  // Gobernanza
  completenessScore  Float    @default(0) // 0..1
  confidenceScore    Float    @default(0)
  status             String   @default("pending") // pending|auto|needs_review|approved|rejected
  fieldEvidence      Json?    // { hfovDeg: { sourceUrl, quote, confidence }, ... }
  lastEnrichedAt     DateTime?
  approvedAt         DateTime?
  approvedById       String?

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([designRole])
  @@index([status])
  @@index([completenessScore])
}
```

Esto es la “base de datos de diseño” que pedís. Separada del precio. Auditable.

### 2.4 Cobertura esperada sobre ~3000 SKUs (realista, no marketing)

| Tipo de dato | Auto-relleno esperable | Notas |
| --- | --- | --- |
| Rol de diseño (`camera`/`mic`/…) | **85–95%** | Ya hay señales en AI profile + categoría |
| Dimensiones caja | **50–70%** | Mejor en Crestron/Hall; peor en SKUs pobres |
| Display diagonal / viewing distance | **60–80%** de displays | Datasheets suelen traerlo |
| Cámara FOV | **40–70%** de cámaras | Depende de marca; muchos PDFs sí |
| Mic pattern / radius | **30–60%** de mics | A menudo hay que inferir por familia |
| Proxy 3D asignable | **90%+** | Mapeo por rol/familia, no scrape |
| GLB único por SKU | **5–15%** (hero) | Arte/conversión, no internet mágico |
| Coverage “aprobado” humano | Proceso, no % | Gate de calidad |

**Lectura importante:** el motor **no** va a dejar 3000/3000 con FOV perfecto. Va a dejar:

- Un % alto **usable para colocar + BOM**.  
- Un % medio **usable para coverage**.  
- Un % bajo **con modelo 3D hero**.  
- El resto con defaults de familia marcados `inferred` / `needs_review`.

Eso alcanza para un Room Builder real si el UI respeta el status del perfil.

### 2.5 Números operativos del batch (~3000)

Orden de magnitud (ajustable):

| Recurso | Estimación |
| --- | --- |
| Serper searches | 1–3 queries/SKU → **3k–9k** calls (cachear por modelo) |
| Fetch página/PDF | 1–2/SKU |
| LLM extract | 1 llamada/SKU con schema JSON (reusar modelo barato + vision solo si hace falta) |
| Concurrency | 2–4 (como crestron-web = 3) + pause 250–500 ms |
| Throughput | ~200–400 productos/hora en worker serio; en Vercel cron hay que encadenar lotes (ya lo hacen profiles/crestron enrich) |
| Corrida completa inicial | varias pasadas / días de calendario operativo, no “un click mágico” |
| Re-enrich | solo si cambia `sourceHash` o `force` |

Costo API (orden de magnitud, no presupuesto cerrado):

- Serper: miles de searches (plan según cuota).  
- LLM: ~3000 extracciones schema; con modelo small/mini suele ser **bajo frente al valor comercial**.  
- Storage PDFs + evidence JSON: barato en Blob.

### 2.6 Reglas duras del motor (para que sea serio)

1. **Nunca inventar números sin marca.** Si no hay evidencia → `null` + default de familia opcional con `inferred=true`.  
2. **Guardar evidencia** (`fieldEvidence`) con URL y fragmento.  
3. **No pisar precio/stock** (misma regla que crestron-web).  
4. **Priorizar fuentes oficiales** (site del fabricante / PDF linked desde ficha Soundtec).  
5. **Human review** para campos de coverage antes de `approved`.  
6. **Respetar ToS / robots** de sitios; preferir URLs ya en `documents[]` y APIs conocidas antes que scrape agresivo.  
7. **Idempotencia** por hash de fuentes (como AI profiles).

### 2.7 Implementación del motor (entregables concretos)

| # | Entregable | Repo |
| --- | --- | --- |
| A1 | Modelo `ProductDesignProfile` + migrate | `prisma/schema.prisma` |
| A2 | Connector `design-enrich` en sync registry | `src/services/sync/connectors/design-enrich.ts` |
| A3 | Pipeline discovery (Serper) + fetch + extract LLM | `src/services/design-enrich/**` |
| A4 | Mapeo label→campo por rol (cámara/mic/display/speaker) | parsers + tests |
| A5 | UI admin: cola needs_review, approve/reject, coverage % | `/admin/design-profiles` |
| A6 | Cron/lote: preview → apply, reporte matched/missing | `/admin/sync` + cron |
| A7 | Script CLI verify por SKU | `scripts/design-enrich-run.ts` |

Esto es trabajo de ingeniería real, no investigación.

---

## 3. Pieza B — Room Builder (vista 3D fija)

### 3.1 Cámara controlada: multi-vista + zoom (sin movilidad 100%)

Decisión actualizada de producto:

- **Varios presets** de cámara por tipología (General, Frente AV, Planta, Detalle; opcional POV de cámara AV).  
- **Zoom** con min/max y **“Enfocar”** a slot/producto/zona.  
- Pan suave opcional **dentro del preset**.  
- **No** orbit libre continuo ni first-person walk.  
- PDF: 2–3 renders de presets elegidos → look corporativo consistente sin caos de ángulos.

Stack: Next.js + React Three Fiber + drei, canvas client-only. Una escena, varias cámaras/presets (o una cámara animada entre targets), luces estables.

### 3.2 Modelo de escena (persistido)

```ts
type RoomProject = {
  id: string;
  clientId?: string;
  name: string;
  templateKey: string;          // "vc-boardroom-m" | "hotel-guest-s" | ...
  category: RoomCategory;       // videoconference|event|hotel|school|residential|lobby|...
  sizePreset?: "S"|"M"|"L";
  areaM2: number;
  heightM: number;
  platform?: "teams"|"zoom"|"byod"|"crestron-home"|null;
  scene: {
    room: { widthM: number; depthM: number; heightM: number; shape: "rect" };
    furniture: PlacedObject[];  // mesas, sillas, cama, estrado...
    devices: PlacedDevice[];    // productId + pose + mount
    camera: {
      preset: "general" | "front_av" | "plan" | "detail" | "device_pov";
      // zoom/target se calculan al enfocar slot/producto; no se guarda orbit libre
      focusTargetId?: string;
    };
  };
  quoteId?: string;
  status: "draft"|"ready"|"quoted";
};
```

### 3.3 Catálogo de tipologías (alcance real v1)

No “todo el mundo” el primer día. Lista **cerrada y profesional**:

| Categoría | Templates iniciales | Parámetros |
| --- | --- | --- |
| Videoconferencia | huddle S/M, boardroom S/M/L | asientos, mesa, display, cámara, mic, touch |
| Educación | aula S/M/L, sala de capacitación | proyector/display, audio, cámara front |
| Hotel | habitación guest S/M, suite | TV, control, audio (Crestron Home / partners) |
| Eventos | salón banquet S/M/L, escenario chico | PA, displays, mics inalámbricos (más BOM que coverage fino) |
| Residencial | living / media room | Crestron Home pack |
| Corporativo extra | lobby / huddle phone | display + scheduling opcional |

Cada template define:

- `areaM2` default + rangos editables  
- layout de muebles paramétricos  
- slots de dispositivos (roles obligatorios/opcionales)  
- reglas de auto-pick por marca preferida  
- presets de cámara + targets de zoom por zona/slot

El usuario puede cambiar m² dentro de rango; el layout escala o redistribuye asientos según reglas.

### 3.4 Objetos en escena

**Dos familias:**

1. **Muebles/escenografía** (no SKU de venta, o SKU servicio): mesa, silla, cama, estrado, pared, puerta — GLB/proxy genéricos Soundtec.  
2. **Dispositivos de catálogo** (`productId`): solo si `ProductDesignProfile.status` ∈ {`auto`,`approved`} o al menos tiene `proxyKey` + dims.

Colocar = click en slot o “agregar desde catálogo filtrado por rol”.  
Quitar / reemplazar / cambiar cantidad.  
Sin rotación libre de cámara; los objetos sí pueden rotar en Y en pasos de 90° si hace falta.

### 3.5 Simulaciones incluidas (reales) vs no incluidas

**Incluidas v1**

- Escala real de la sala (m², alto).  
- Colocación a escala de proxies.  
- Coverage estimado cámara (cono FOV) y mic (área) **si hay perfil aprobado/auto con confianza**.  
- Viewing distance de display (zona OK / corta / lejos).  
- Warnings: asientos fuera de cobertura, SKU discontinuado, sin dims, plataforma incompatible.  
- BOM vivo + precio cliente.  
- Renders PNG de presets (General + Frente/Detalle) → PDF.

**No incluidas v1 (explícito)**

- Acústica (RT60, SPL map).  
- Cableado / PoE budget avanzado.  
- Orbit / walk-through / VR.  
- Import Revit del edificio.  
- Garantía de que “funciona en obra”.

### 3.6 Bridge comercial (ya casi existe)

```
RoomProject.scene.devices
  → aggregate productId + qty
  → pricing.ts (clientId)
  → createQuoteFromRoomProject()
  → QuoteItem[] + QuoteAsset (render iso)
  → issueQuote → PDF Soundtec
```

Reusa: quick-quote matching, quote modules, puppeteer PDF.  
Nuevo: action `createQuoteFromRoomProject`, módulo PDF `room_design`.

### 3.7 Implementación del builder (entregables concretos)

| # | Entregable | Notas |
| --- | --- | --- |
| B1 | Prisma `RoomProject` | scene JSON + links |
| B2 | Template registry | tipologías + tamaños S/M/L + m² |
| B3 | Viewport R3F multi-vista | presets + zoom/focus a zona; sin orbit libre |
| B4 | Librería proxy GLB (20–40 assets) | roles + muebles |
| B5 | Palette catálogo filtrada | por designRole + marca |
| B6 | Coverage overlays 2D sobre la vista | o planos semitransparentes en 3D |
| B7 | Panel BOM + crear cotización | precios reales |
| B8 | Export render + módulo PDF | assets PROJECT |
| B9 | Admin UI `/admin/room-builder` | primero interno |
| B10 | Tests | templates, aggregate BOM, coverage math |

---

## 4. Orden de implementación real (secuencial)

Esto no es un wishlist: es el orden en que se construye para no mentir al usuario.

### Etapa 1 — Fundación de datos (bloqueante)

- Schema `ProductDesignProfile`.  
- Connector design-enrich sobre **marcas core primero** (Crestron + displays + cámaras/mics del lineup UC).  
- UI de review.  
- Meta: N SKUs `approved`/`auto` suficientes para tipologías VC.

### Etapa 2 — Templates VC + builder multi-vista

- Huddle + boardroom S/M/L.  
- Proxies profesionales.  
- Presets de cámara + zoom a slots.  
- BOM → Quote → PDF con 2–3 renders.  
- Coverage estimado en VC.

### Etapa 3 — Expandir tipologías

- Aula / hotel / living Home / salón eventos (BOM-first en eventos).  
- Más enrich batch del resto del catálogo (~3000).  
- Defaults de familia para gaps.

### Etapa 4 — Endurecer

- Portal cliente (si se decide).  
- Más GLB hero.  
- Cable map / PoE (opcional).  
- Métricas: % perfiles completos, tiempo diseño→COT, tipologías más usadas.

---

## 5. Alcance por tipología (qué tan “completo” queda)

| Tipología | Complejidad | Qué se ve profesional | Limitación aceptada |
| --- | --- | --- | --- |
| Videoconferencia | Alta (core) | Layout + FOV + mic + display + BOM + PDF | Coverage estimado |
| Aula / training | Alta | Similar a VC + audio zona | Acústica no simulada |
| Hotel guest | Media | TV + control + escena habitación | Menos coverage AV |
| Residencial living | Media | Packs Crestron Home | No reemplaza Home Configurator |
| Salón eventos | Media-alta | BOM PA/displays/mics + escena | Coverage PA simplificado |
| Lobby | Baja | Display + estética | Pocas reglas |

Con multi-vista + zoom acotado, **todas** estas tipologías son implementables; la profundidad de simulación no es uniforme, y eso hay que decirlo en el producto.

---

## 6. Respuestas directas a tu idea

### ¿Motor que busque en internet producto por producto?

**Sí.** Patrón: Serper discovery → fetch datasheet/página → extract estructurado → `ProductDesignProfile` con evidencia y confianza. Reusa sync/cron/lotes existentes. No scrapea a ciegas 3000 sitios distintos sin priorizar fuentes oficiales y docs ya linkeados.

### ¿Base de datos con “toda” la info?

**Base de diseño sí; “toda” no.** Vas a tener una base **usable y gobernada**, con huecos explícitos. Un Room Builder completo de verdad se apoya en status/confidence, no en fingir completitud 100%.

### ¿Escenas: VC, eventos, hotel, escuela, tamaños, m²?

**Sí, como templates versionados** con S/M/L y override de m². Eso es el corazón del builder, no un extra.

### ¿Agregar objetos + modelado 3D con varias vistas?

**Sí.** Presets + zoom a zonas = control profesional sin movilidad total. Objetos = muebles proxy + dispositivos con `productId`. PDF con varios encuadres.

### ¿Es “algo que podría llegar a ser” o implementación real?

Es **implementación real en dos sistemas**:

1. Enrichment pipeline (datos).  
2. Room Builder app (escenas + comercial).

Ambos encajan en el monorepo actual. El riesgo no es técnico abstracto: es **curación + contenido 3D + disciplina de tipologías**. Con eso, el alcance de arriba es construible.

---

## 7. Criterios de “listo para usar en ventas” (no demo)

El producto se considera real cuando:

1. ≥ tipologías VC (huddle + boardroom) con layouts sólidos.  
2. Catálogo core de esas tipologías con perfiles `auto`/`approved` (dims + rol + FOV/display donde aplica).  
3. Vista 3D con presets + zoom a zonas estable en desktop.  
4. BOM → cotización → PDF Soundtec con 2–3 renders en el flujo de un vendedor.  
5. Warnings visibles cuando falta data (no inventar coverage).  
6. Proceso admin para re-enrich y aprobar perfiles nuevos.

Hasta no cumplir eso, no se vende como Room Builder completo — se desarrolla hasta ahí.

---

## 8. Decisiones que hay que tomar ahora (bloquean implementación)

1. Lista final de tipologías del primer release comercial.  
2. Marcas “enrich obligatorio” vs “proxy genérico”.  
3. ¿Review humano de FOV antes de coverage, o `auto` con disclaimer?  
4. ¿Solo admin o también portal en el primer release?  
5. Presupuesto de arte 3D (cantidad de proxies/hero GLB).  
6. Cuotas Serper/OpenAI para la corrida de ~3000.

---

## 9. Mapa de docs

| Doc | Para qué |
| --- | --- |
| Este | **Implementación y alcance real** |
| limitaciones-alcance | Qué datos hay hoy / límites honestos |
| soundtec-room-builder-3d-propio | Arquitectura 3D / stack |
| crestron-room-builder-integracion | Benchmark Crestron / import BOM opcional |

**Sin implementación de producto en este trabajo de investigación;** este documento es el plan concreto para ejecutar después.
