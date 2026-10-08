# Investigación: Crestron Room Builder → Soundtec

**Fecha:** 2026-10-08  
**Tipo:** investigación / viabilidad (sin implementación)  
**Estado:** documento de referencia para decisión de producto  
**Alcance:** evaluar qué es el “Room Builder” de Crestron y si encaja en la plataforma Soundtec.

---

## 1. Resumen ejecutivo

Crestron no tiene un único producto llamado “Room Builder”. Hay **tres herramientas cercanas** que conviene no mezclar:

| Herramienta | Para qué sirve | Salida comercial útil | Encaje con Soundtec |
| --- | --- | --- | --- |
| **Collab Room Builder** | Configurador web de salas de colaboración (Teams / Zoom) | BOM recomendado + visualización de sala | **Alto** como fuente de BOM hacia cotizaciones |
| **Intelligent Video Room Designer** | Diseño espacial de cámaras/mics para Automate VX | Archivo `.1brd` + imagen | **Bajo** (commissioning, no pricing) |
| **Crestron Home Configurator** | Diseño residencial Crestron Home OS | BOM en **XLS** (Model, Qty, MSRP) | **Alto** en residencial; ya hay flag Crestron Home en catálogo |

**Veredicto:** sí es viable integrar el flujo comercial del Room Builder / Configurator a Soundtec, pero **no como iframe embebido ni como API oficial pública**. El camino realista es:

1. Usar el tool de Crestron para diseñar.
2. Traer el BOM (export / lista de modelos + cantidades) a Soundtec.
3. Matchear contra el catálogo local (`modelNumber` / `internalSku`).
4. Precificar con el motor de Soundtec (`pricing.ts`) y armar `Quote` o pedido.

La plataforma ya tiene el 70–80 % del stack receptor (catálogo Crestron, sync Xtrabone + crestron.com, Crestron Home, cotizaciones BOM, paste de SKUs en cotización rápida). Falta el puente “BOM externo → Quote”.

**No hay API pública documentada** del Collab Room Builder para leer proyectos por código. Cualquier integración profunda (embed, sync bidireccional, push automático) requiere acuerdo con Crestron / partner portal.

---

## 2. Contexto: qué es Soundtec hoy

Soundtec es un portal B2B + admin para distribución / integración AV (audio, video, control, UC). Stack: Next.js 14, Prisma/Postgres, Auth.js, Vercel.

Capacidades relevantes ya en producción o avanzadas:

- Catálogo con precios locales (márgenes, descuentos, visibilidad por cliente).
- Sync Crestron vía **Xtrabone** (precio/stock) y **crestron-web** (ficha oficial).
- Filtro / marca **Crestron Home** y matching de compatibilidad.
- Módulo de **cotizaciones** con BOM, secciones, export PDF/Word/Excel, IA asistida.
- **Cotización rápida** con resolución de SKUs pegados (`resolveQuickQuoteSkus`).
- Pedidos del portal (`CustomerRequest`) convertibles a cotización (`createQuoteFromRequest`).
- Import Excel genérico de catálogo (`/admin/imports`).

**No existe** hoy: room design, plano de sala, Collab Room Builder, importador de BOM Crestron, ni conector sync tipo `crestron-room-builder`.

---

## 3. Mapa de herramientas Crestron (detalle)

### 3.1 Collab Room Builder (candidato principal)

- **Qué es:** configurador online de Crestron para salas de colaboración.
- **URL pública de referencia:** [crestron.com → Support → Tools → Configurators → Collab Room Builder](https://www.crestron.com/Support/Tools/Configurators/Collab-Room-Builder).
- **Flujo típico (fuentes públicas / partners):**
  1. Tamaño y layout de sala, asientos.
  2. Plataforma UC: Microsoft Teams Rooms o Zoom Rooms.
  3. Recomendación de displays, cámaras, audio, control y accesorios.
  4. Visualización de la sala.
  5. **Bill of materials** listo para procurement.
- **Audiencia:** enterprise / education / healthcare / government que estandarizan salas híbridas.
- **API:** no documentada en material público. La página oficial pide contacto a soporte; el tool parece UI web, no SDK.
- **Implicación:** integración Soundtec = **importar el resultado (BOM)**, no reimplementar el diseñador.

### 3.2 Intelligent Video Room Designer

- Producto de catálogo: *Room Designer Software* (Intelligent Video).
- Corre en Chrome; plano a escala; cámaras, mics, zonas, proximity check.
- Export: imagen o proyecto **`.1brd`** para Automate VX.
- Útil para ingeniería / commissioning de Automate VX; **no** es el flujo comercial de listado de precios Soundtec.
- Integración recomendada: adjuntar `.1brd` / imagen como asset de cotización (`PLAN` / `PROJECT`), sin parsear el BOM desde ese formato.

### 3.3 Crestron Home Configurator

- Acceso: `portal.my.crestron.com` → Crestron Home Configurator.
- Diseña configuración residencial offline del sitio; deploy code al processor.
- **Reports → Bill of Materials → Export to XLS.**
- Columnas típicas de BOM Crestron: `Model`, `Qty`, `MSRP`, `Extended MSRP` (a veces también Description).
- El propio manual advierte: el BOM **no incluye** todos los accesorios necesarios (cables, faceplates, power supplies, bridges, etc.). Eso refuerza el valor de Soundtec: completar, nacionalizar y cotizar.
- API REST de Crestron Home OS (`/cws/api/rooms`, `/devices`) es para **sistemas instalados**, no para leer el Configurator ni su BOM.

### 3.4 Otras piezas del ecosistema (fuera de scope inmediato)

| Pieza | Nota |
| --- | --- |
| `.AV Framework` | Configuración de sala en el procesador; no es BOM comercial. |
| Crestron Construct / D3 Pro | UI / lighting programming; D3 Pro en maintenance mode → Crestron Home. |
| XiO Cloud Partner Portal | Integración de dispositivos IoT; requiere contrato Crestron. |
| Flex kits / Collaboration Spaces lookbook | Referencia de diseño; no API. |

---

## 4. Estado actual de Crestron dentro de Soundtec

### 4.1 Identidad de producto

| Campo | Rol |
| --- | --- |
| `Product.internalSku` | Material Number Crestron (ej. `6511816`). Match del sync Xtrabone. |
| `Product.modelNumber` / `manufacturerItem` | Modelo comercial (ej. `CP4`, `DM-NVX-363`). |
| `Product.sourceMetadata` | Raw Xtrabone + `crestronCom` del enriquecimiento web. |
| `Product.isCrestronHomeCompatible` | Flag de compatibilidad. |
| `CrestronHomeDevice` | Catálogo auxiliar de dispositivos Home (sin FK a Product). |

**Punto crítico para Room Builder:** los BOM de Crestron salen casi siempre por **Model** (`TSW-760-B-S`), no por Material Number. El paste actual de cotización rápida busca primero contra `internalSku` expuesto como `sku`. Hay que diseñar matching por `modelNumber` / `manufacturerItem` (y fallback a SKU) antes de un importador serio.

### 4.2 Sync ya existente

```
Xtrabone (crestron)  → precio, stock, peso, taxonomía
crestron.com (crestron-web) → ficha, specs, docs, accesorios, badges
```

Documentado en `docs/crestron-web-enrichment.md` y `docs/sync-refactor/*`.

Regla de oro a preservar: **Room Builder nunca debe escribir precios**. Precio = Xtrabone + motor Soundtec. El MSRP del BOM Crestron es referencia / validación, no costo de venta.

### 4.3 Superficies receptoras naturales

| Superficie | Archivo / ruta | Uso para Room Builder |
| --- | --- | --- |
| Cotización rápida + paste SKUs | `src/server/actions/quick-quote.ts` | Prototype más barato: pegar Model+Qty |
| BOM de cotización | `src/app/admin/quotes/[id]/quote-bom-table.tsx` | Destino final del import |
| Cotización desde pedido | `createQuoteFromRequest` | Flujo si el cliente arma pedido desde BOM |
| Import Excel | `/admin/imports` + `src/services/excel.ts` | Parser de XLS de Home Configurator |
| Assets de cotización | modelo `Quote` (PLAN/PROJECT) | Guardar render / `.1brd` / PDF del diseño |
| IA de cotizaciones | brief + `BUILD_FROM_BRIEF` | Complementar BOM incompleto con accesorios |

---

## 5. Escenarios de integración (de más simple a más ambicioso)

### Escenario A — Manual asistido (viabilidad inmediata)

**Qué hace el usuario**

1. Diseña en Collab Room Builder o Home Configurator.
2. Copia modelos + cantidades (o exporta XLS).
3. En Soundtec: Cotización rápida → pegar líneas `MODEL QTY`.
4. Revisa unmatched, completa accesorios, emite COT con precios locales.

**Pros:** cero dependencia de API Crestron; reusa `resolveQuickQuoteSkus`; valor en días.  
**Contras:** fricción manual; matching por modelo hay que endurecer; no guarda el “proyecto” Crestron como entidad.

**Esfuerzo técnico:** bajo (mejoras de matching + UX de paste / unmatched).

### Escenario B — Importador de BOM XLS / CSV

**Qué hace**

1. Upload del XLS del Home Configurator (o CSV exportado del Collab Room Builder si el tool lo permite).
2. Parser con columnas `Model`, `Qty` (+ MSRP opcional).
3. Match → `Product` por `modelNumber` / `manufacturerItem` / `internalSku`.
4. Crea `Quote` (o `CustomerRequest`) con ítems matched + lista de faltantes.
5. Guarda raw del archivo y metadata (`source: crestron-room-builder`, revision, platform Teams/Zoom si se conoce).

**Pros:** trazabilidad; mismo patrón que import Excel; MSRP sirve para auditoría vs `listPriceUsd`.  
**Contras:** formato exacto del Collab Room Builder no está documentado públicamente (hay que capturar un export real en partner session).

**Esfuerzo técnico:** medio. Encaja con arquitectura de sync/imports sin nuevo conector de precios.

### Escenario C — Entidad “Proyecto de sala” en Soundtec

Modelo conceptual (no implementado):

```
RoomProject
  clientId, name, platform (Teams|Zoom|Home|Other)
  roomSize, layout notes
  sourceTool (COLLAB_ROOM_BUILDER | HOME_CONFIGURATOR | ROOM_DESIGNER | MANUAL)
  sourceFileUrl / sourceMetadata
  items[] → productId?, modelCode, qty, matchStatus
  quoteId? / requestId?
```

UI admin: importar BOM → revisar matches → “Crear cotización”.  
Portal (opcional, más adelante): cliente sube BOM o pide “armar sala UC” y el admin completa.

**Pros:** proyectiza el trabajo comercial; permite versionar revisiones del BOM Crestron.  
**Contras:** nuevo dominio; hay que definir permisos y ciclo de vida.

**Esfuerzo técnico:** medio-alto.

### Escenario D — Embed / API nativa Crestron

Iframe del Collab Room Builder, OAuth partner, webhook de BOM.

**Estado:** **no factible con información pública**. Requiere:

- Contacto Crestron LATAM / tech sales.
- Acceso partner / SDK si existiera.
- Posibles restricciones de branding y datos.

**Recomendación:** no planificar desarrollo hasta confirmar disponibilidad con Crestron. Documentar como “fase futura condicionada”.

### Escenario E — Reimplementar un Room Builder propio

Wizard Soundtec (tamaño sala → Teams/Zoom → recomendaciones desde catálogo local + reglas + IA).

**Pros:** control total, precios nativos, multi-marca (Crestron + Sonance + …).  
**Contras:** alto costo de dominio; hay que mantener reglas de diseño UC; no reemplaza el expertise / matrices oficiales de Crestron.

**Cuándo tiene sentido:** si Collab Room Builder no cubre LATAM / kits locales, o si se quiere un diferenciador multi-marca. No es el primer paso.

---

## 6. Matching de catálogo (riesgo técnico #1)

### Problema

BOM Crestron ≈ `Model` (`DM-NVX-363`, `TSW-1070-B-S`).  
Soundtec sync Xtrabone ≈ `internalSku` Material Number.  
`modelNumber` se completa sobre todo vía crestron-web.

### Matriz de match propuesta

| Prioridad | Clave | Notas |
| --- | --- | --- |
| 1 | `modelNumber` exacto (case-insensitive) | Ideal para BOM |
| 2 | `manufacturerItem` exacto | A veces duplica el modelo |
| 3 | `internalSku` exacto | Si el export trae material number |
| 4 | `normalizedName` / search fuzzy | Solo con confirmación humana |
| 5 | Unmatched → fila pendiente | No inventar producto |

### Gaps esperados

- Variantes de color/acabado (`-B-S` vs `-W-S`) si el catálogo local no las tiene todas.
- Kits Flex vs componentes sueltos.
- Accesorios omitidos por el Configurator (cables, faceplates, PSUs).
- Productos discontinuados (`isDiscontinued`) que el Room Builder aún sugiere.
- MSRP USD del BOM ≠ `baseCostUsd` ni precio cliente Soundtec.

### Mitigaciones

- Correr crestron-web enrich sobre el catálogo antes de usar el importador.
- Reporte de coverage: % de modelos del BOM matcheados.
- Sugerencia IA de accesorios faltantes (ya alineado con el diseño de cotizaciones).
- Nunca pisar precio con MSRP del export.

---

## 7. Flujos comerciales recomendados

### Flujo 1 — Enterprise UC (Collab Room Builder)

```
Cliente / vendedor diseña en Collab Room Builder
        ↓
BOM (Model + Qty) [+ screenshot / PDF]
        ↓
Soundtec: import / paste → Quote
        ↓
Match catálogo + pricing cliente
        ↓
Completar infraestructura / instalación / impuestos
        ↓
Emitir PDF/Word/Excel Soundtec
```

### Flujo 2 — Residencial (Home Configurator)

```
Diseño en Crestron Home Configurator
        ↓
Export XLS Bill of Materials
        ↓
Soundtec importador XLS → Quote
        ↓
Cruzar isCrestronHomeCompatible / completar gaps del manual
        ↓
Cotización + condiciones
```

### Flujo 3 — Automate VX (Room Designer)

```
Diseño espacial .1brd
        ↓
Adjuntar a Quote como asset de proyecto
        ↓
BOM de hardware se carga aparte (A o B)
```

---

## 8. Qué NO integrar

- Escribir precios desde Room Builder / MSRP Crestron.
- Scrape no autorizado del Collab Room Builder (términos, fragilidad, riesgo legal).
- Sustituir Xtrabone o crestron-web por el Room Builder.
- Parsear `.1brd` como fuente de pricing.
- Embebido del tool sin acuerdo Crestron.
- Tratar la REST API de Crestron Home OS (rooms/devices del processor) como fuente de BOM de diseño.

---

## 9. Evaluación de viabilidad

| Criterio | Nota | Comentario |
| --- | --- | --- |
| Alineación de negocio | Alta | Soundtec cotiza sistemas Crestron; Room Builder acelera el BOM inicial |
| Datos de catálogo | Alta | Ya hay sync dual + Home |
| Superficie técnica receptora | Alta | Quotes + quick-quote + Excel |
| API oficial Room Builder | Baja / desconocida | Bloquea embed y sync automático |
| Matching Model → Product | Media | Hay que construirla; hoy el paste privilegia SKU interno |
| Completitud del BOM Crestron | Media | El manual admite gaps de accesorios |
| Esfuerzo para MVP (Escenario A/B) | Bajo–medio | Sin bloquearse en partner API |
| Riesgo legal/ToS | Medio si se scrapea | Preferir export oficial + acuerdo |

**Conclusión:** integración **sí, por el lado del BOM hacia cotizaciones**. No como reemplazo del Room Builder ni como conector de sync de catálogo.

---

## 10. Roadmap sugerido (solo planificación)

### Fase 0 — Discovery con partner (sin código)

- Sesión con Crestron LATAM: ¿Collab Room Builder disponible para dealers AR/LATAM?
- Capturar 2–3 exports reales (Collab + Home Configurator XLS).
- Confirmar si hay CSV/PDF además de pantalla.
- Preguntar por API / embed / white-label (probable “no” a corto plazo).

### Fase 1 — MVP interno (Escenario A+)

- Mejorar resolución de líneas por `modelNumber`.
- UI de paste/import en cotización rápida con reporte matched/unmatched.
- Documentar SOP interno: “cómo pasar de Room Builder a COT”.

### Fase 2 — Importador XLS (Escenario B)

- Parser dedicado Home Configurator BOM.
- Opción “Crear cotización desde BOM Crestron”.
- Guardar raw + revision + MSRP de referencia (no precio).

### Fase 3 — RoomProject (Escenario C)

- Entidad de proyecto de sala + link a Quote/Request.
- Adjuntos de diseño (render, `.1brd`, PDF).
- Métricas: coverage de match, tiempo BOM→COT.

### Fase 4 — Condicional (Escenario D/E)

- Solo si Crestron abre API/embed, o si el negocio pide wizard multi-marca propio.

---

## 11. Preguntas abiertas

1. ¿El equipo usa hoy Collab Room Builder, Home Configurator, ambos, u otra herramienta (Excel propio)?
2. ¿El BOM típico es UC comercial (Flex / Teams / Zoom) o residencial Crestron Home?
3. ¿Tienen cuenta dealer en `portal.my.crestron.com` y acceso real al Configurator?
4. ¿El export del Collab Room Builder es XLS/CSV o solo lista en pantalla?
5. ¿Quieren que el **cliente portal** importe BOMs o solo el admin/vendedor?
6. ¿Hay kits locales / part numbers LATAM distintos al catálogo USA de Xtrabone?
7. ¿Prioridad de completar accesorios con IA vs revisión humana estricta?

---

## 12. Referencias

### Crestron / externos

- [Collab Room Builder (página oficial)](https://www.crestron.com/Support/Tools/Configurators/Collab-Room-Builder)
- [Descripción funcional Collab Room Builder (partner BCS)](https://www.bcsconsultants.com/blog/designing-the-right-av-setup-made-easy-with-collab-room-builder/)
- [Room Designer Software (Intelligent Video)](https://www.crestron.com/Products/Catalog/Unified-Communications/Intelligent-Video/Software/Room-Designer-Software)
- [Room Designer Features (docs)](https://docs.crestron.com/en-us/9487/Content/Topics/Automate/Overview/Features/Room-Designer-Features.htm)
- [Crestron Home Configurator — About](https://docs.crestron.com/en-us/8525/Content/CP4R/Crestron-Home-Configurator/About.htm)
- [Crestron Home Configurator — Reports / BOM XLS](https://docs.crestron.com/en-us/8525/Content/CP4R/Crestron-Home-Configurator/Reports-Tab.htm)
- [Crestron Home REST API — Rooms](https://sdkcon78221.crestron.com/sdk/Crestron-Home-API/Content/Topics/API-Reference/Rooms-API.htm) (runtime, no Configurator)

### Internos Soundtec

- `docs/crestron-web-enrichment.md`
- `docs/sync-refactor/PHASE-2-unified-architecture.md`
- `docs/superpowers/specs/2026-08-15-modulo-cotizaciones-design.md`
- `src/services/sync/connectors/crestron.ts`
- `src/services/sync/connectors/crestron-web.ts`
- `src/server/actions/quick-quote.ts` (`resolveQuickQuoteSkus`)
- `src/server/actions/crestron-home.ts`
- `src/app/admin/quotes/**`

---

## 13. Decisión pedida

Para avanzar a implementación hace falta elegir:

1. **Target primario:** Collab Room Builder (UC) vs Home Configurator (residencial) vs ambos.
2. **Profundidad:** solo SOP + paste (Fase 1) vs importador XLS (Fase 2).
3. **Audiencia:** admin only vs portal cliente.
4. **Contacto Crestron:** sí/no agenda discovery partner antes de Fase 2.

Hasta esa decisión, este documento es la base de investigación. **No se implementó código** en este trabajo.
