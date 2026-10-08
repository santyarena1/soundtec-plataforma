# Investigación: Room Builder 3D propio de Soundtec

**Fecha:** 2026-10-08  
**Tipo:** investigación / viabilidad (sin implementación)  
**Relacionado:** [`2026-10-08-crestron-room-builder-integracion.md`](./2026-10-08-crestron-room-builder-integracion.md)  
**Visión del producto:** no embeber Crestron; **tomar su lógica de valor** (y la de peers como Cisco Workspace Designer) y construir un diseñador de salas **Soundtec**, multi-marca, interactivo en 3D, que genere **cotizaciones y PDF propios**.

---

## 1. Resumen ejecutivo

**Sí se puede.** El mercado ya demostró el patrón:

| Referencia | Qué prueba |
| --- | --- |
| **Cisco Workspace Designer** (`designer.webex.com`) | Room builder 3D web con R3F, coverage de cámara/mic, blueprint + BOM. Hecho por un equipo web pequeño en Cisco Norway. |
| **Crestron Collab Room Builder / Room Designer / Home Configurator** | Wizard + BOM / diseño espacial; no es el destino, es el **benchmark de UX y reglas**. |
| **Roomly, Datavideo Room Designer, Video Room Calculator** | Coverage FOV/mic en plano + preview 3D; dominio AV ya resuelto conceptualmente. |
| **Open source (Home3D, Gaudi, Blueprint3D, Ikea-Kreativ clones)** | 2D plan ↔ 3D scene + BOM + GLB es un patrón conocido en React/Three.js. |

**Veredicto para Soundtec:** viable y alineado al negocio (catálogo + pricing + COT PDF ya existen). El riesgo no es “¿se puede renderizar 3D?” — eso es resuelto. El riesgo real es:

1. **Librería de assets 3D** de productos (y muebles) a escala real.
2. **Metadatos de diseño** (FOV, patrón de mic, altura de montaje, clearances) por SKU.
3. **Motor de reglas** multi-marca (Teams/Zoom/Crestron Flex/Home + Sonance + SoundTube + …).
4. **Puente escena → Quote → PDF Soundtec** (esto es lo más fácil: ya hay stack).

**No conviene** arrancar con “CAD fotorrealista de cada SKU”. Conviene un producto en capas: wizard + escena paramétrica → coverage → BOM vivo → cotización → PDF con renders.

---

## 2. Qué quiere decir “propio de Soundtec”

### 2.1 Propuesta de valor

Un usuario (vendedor Soundtec o, más adelante, cliente portal) debería poder:

1. Elegir tipo de espacio (huddle, boardroom, training, aula, home theater, living Crestron Home, etc.).
2. Definir tamaño / layout (o subir plano escalado).
3. Ver la sala en **3D interactivo** (orbit, walk-through básico, vista desde cámara).
4. Colocar / sugerir equipos de **marcas del catálogo Soundtec**.
5. Ver cobertura (cámara, mic, display) y warnings.
6. Obtener un **BOM vivo** con precios del motor Soundtec (cliente, márgenes, IVA).
7. Generar **cotización** en el módulo actual y **PDF** con el diseño corporativo Soundtec (no el de Crestron/Cisco).

### 2.2 Qué NO es

- Un clon 1:1 del Collab Room Builder (toque legal + sin sentido: somos multi-marca).
- Un reemplazo de Autodesk/Revit para obra civil.
- Un sync de precios desde Crestron Room Builder.
- Un iframe de Cisco/Crestron.

### 2.3 Analogía correcta

> **Cisco Workspace Designer**, pero con el **catálogo y pricing de Soundtec**, salida a **Quote + PDF Soundtec**, y reglas que incorporen Crestron *y* el resto de marcas representadas.

---

## 3. Marcas y catálogo disponibles hoy (base de producto)

Ya en plataforma / branding (no lista cerrada de DB):

**Exclusivas / foco landing:** Crestron, Crestron Home, Dante, Atlona, SoundTube, Blaze Audio, Bluesound Professional, NDT, Flatpanel Audio.

**Partners / ecosistema:** Yamaha, JBL, Shure, QSC, Kramer, Barco, HP Poly, Epson, Samsung, LG, L-Acoustics, Bose, Logitech, …

**Sync activo:** Crestron (Xtrabone + web), Sonance (+ submarcas), SoundTube, Hall Research group (Atlona, Javelin, …).

**Implicación:** el Room Builder debe ser **agnóstico de marca a nivel escena** (un “device” tiene `productId`, pose, mount) y **específico de marca a nivel reglas** (“si platform=Teams y brand preferida=Crestron Flex → kit sugerido”).

---

## 4. Qué ya tenemos vs qué falta

| Capacidad | Estado en Soundtec | Rol en Room Builder |
| --- | --- | --- |
| Catálogo + visibilidad | Existe | Paleta de productos colocables |
| Pricing por cliente | `pricing.ts` | BOM con precios reales |
| Cotizaciones + BOM | `/admin/quotes` | Destino del diseño |
| PDF corporativo | HTML → puppeteer (`quote-document-html` / `quote-pdf`) | Emisión final |
| Word/Excel COT | Existe | Entregables secundarios |
| Brief / `QuoteContext.spaces` / assets PLAN·PROJECT | Existe | Guardar plano, renders, JSON de escena |
| Dimensiones W/H/D | Parcial (Crestron.com, Sonance, Hall…) | Cajas paramétricas sin GLB |
| Documents CAD/Revit en ficha | URLs, no GLB | Fuente eventual de assets |
| Three.js / R3F / glTF | **No existe** | Hay que introducir |
| FOV / mic pattern / mount height por SKU | **No existe** | Nuevo modelo de datos |
| Reglas de diseño de sala | **No existe** (IA de COT es otra cosa) | Motor de sugerencias |
| Librería 3D de productos | **No existe** | Mayor costo del proyecto |

---

## 5. Arquitectura conceptual recomendada

```
┌─────────────────────────────────────────────────────────────┐
│  Soundtec Room Builder (UI)                                 │
│  Wizard · Plano 2D · Viewport 3D · Coverage · BOM panel     │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
     ┌──────────────────┐          ┌────────────────────┐
     │ RoomScene (JSON) │◀────────▶│ Catalog / Pricing  │
     │ walls, furniture │  productId│ Product + rules   │
     │ devices, cameras │          └────────────────────┘
     │ coverage params  │
     └────────┬─────────┘
              │ createQuoteFromScene()
              ▼
     ┌──────────────────┐          ┌────────────────────┐
     │ Quote + items    │─────────▶│ PDF Soundtec       │
     │ assets: renders  │          │ (+ Word/Excel)     │
     │ scene JSON       │          └────────────────────┘
     └──────────────────┘
```

### 5.1 Single source of truth: `RoomScene`

Documento serializable (Postgres Json o tabla dedicada), no “estado suelto del canvas”:

```ts
type RoomScene = {
  version: 1;
  meta: { name; clientId?; platform?: "teams" | "zoom" | "crestron-home" | "custom" };
  room: {
    shape: "rect" | "polygon";
    widthM: number; depthM: number; heightM: number;
    // o walls[] con puntos 2D
  };
  furniture: Array<{ id; type: "table"|"chair"|"display-stand"; pose; sizeM }>;
  devices: Array<{
    id;
    productId;           // FK Product Soundtec
    role: "camera"|"mic"|"display"|"speaker"|"touch"|"codec"|"processor"|"other";
    pose: { x; y; z; rotY }; // metros
    mount: "table"|"wall"|"ceiling"|"rack";
  }>;
  annotations?: …;
};
```

El 2D y el 3D son **proyecciones** del mismo JSON (patrón Home3D / Gaudi / Cisco).

### 5.2 Capas de software

| Capa | Tecnología sugerida | Notas |
| --- | --- | --- |
| App shell | Next.js App Router (ya) | Ruta tipo `/admin/room-builder` o `/portal/room-builder` |
| Estado escena | Zustand (o XState para wizard) | Separar UI state vs scene |
| 2D plan | Canvas / react-konva / SVG | Dibujo de muros, snap, escala |
| 3D | **Three.js + React Three Fiber + drei** | Mismo stack que Cisco Workspace Designer |
| Colisiones / constraints | Funciones puras fuera de React | Testeable |
| Coverage | Geometría (conos FOV, discos/rectángulos mic) | 2D overlay + volumen 3D |
| Persistencia | Prisma (`RoomProject` + `sceneJson`) | Link a `Quote` |
| BOM → Quote | Server actions reusando `addProductToQuote` / quick-quote | Precios siempre del motor |
| PDF | Pipeline actual + embeds de screenshots | `QuoteAsset` kind PROJECT |

### 5.3 Por qué R3F y no Unity/Unreal

- Corre en el mismo monorepo Next.
- Deploy Vercel sin runtime de juego.
- Equipo web puede mantenerlo.
- Cisco ya validó el approach para meeting rooms 3D.
- Unity WebGL suma peso, tooling y fricción de integración con Prisma/auth.

---

## 6. Estrategia de assets 3D (el cuello de botella)

Orden de madurez (de barato a caro):

### Nivel A — Paramétrico (MVP visual)

- Sala: extrusión de muros desde plano 2D.
- Muebles: cajas/cápsulas con medidas reales (mesa 3.0×1.2 m, sillas).
- Equipos: **bounding boxes** coloreadas por rol + logo/badge de marca, usando `widthCm/heightCm/depthCm` del Product.
- Displays: planos con textura “pantalla encendida” genérica.

**Ventaja:** se puede lanzar sin modelar cada SKU.  
**Límite:** no impresiona tanto en demos premium, pero sirve para coverage y BOM.

### Nivel B — Biblioteca de proxys tipados

GLB genéricos por **familia**:

- touch panel 7/10/15"
- barra UC / soundbar
- PTZ camera
- ceiling mic / table mic
- codec / mini PC
- speaker ceiling / wall
- TV 55/65/75/86"

Cada `Product` mapea a un `proxyKey` + escala por dimensiones.

### Nivel C — Modelos por SKU / familia comercial

- Fuente: CAD/Revit/DWG de `Product.documents` → Blender → **GLB** (metros, Y-up, Draco, &lt;2–3 MB).
- Pipeline industrial: IFC/Revit → GLB + metadata (existen demos open source; Autodesk APS para RVT).
- Priorizar top sellers Crestron Flex + displays + cámaras que más se cotizan.

### Nivel D — Fotorrealismo / materiales PBR por acabado

Solo si el marketing lo exige. Costo alto, baja utilidad para BOM técnico.

**Recomendación:** arrancar **A+B**. Encargar C solo para 20–40 SKUs hero. No bloquear el producto esperando CAD perfecto de todo el catálogo.

### Especificación mínima de un GLB Soundtec

| Regla | Valor |
| --- | --- |
| Formato | `.glb` embebido |
| Unidades | metros |
| Origen | base del equipo en (0,0,0) |
| Compresión | Draco |
| Naming | `brand_model_role.glb` |
| Binding | `Product.model3dUrl` + `proxyKey` + dims |

---

## 7. Metadatos de diseño que hay que inventar (schema nuevo)

Hoy el Product no tiene lo que un Room Designer necesita. Campos candidatos:

```
ProductDesignProfile
  productId
  role: camera | mic | display | speaker | touch | codec | …
  mountOptions: wall|ceiling|table|rack[]
  defaultMountHeightM
  clearanceM
  // cámara
  hfovDeg, vfovDeg, maxRangeM
  // mic
  pattern: cardioid|omni|array|beam | coverageRadiusM | coverageWidthM
  // display
  diagonalIn, viewingDistanceMinM, viewingDistanceMaxM
  // audio
  coverageAngleDeg, splHint
  proxyKey / model3dUrl
  designNotes
```

Fuentes de datos:

1. Spec sheets ya parseadas (`specifications` JSON) — extracción asistida.
2. Carga manual admin para top SKUs.
3. Defaults por familia (todas las PTZ 70° HFOV hasta que se refine).
4. IA asistida leyendo ficha (con revisión humana).

Sin este perfil, el 3D es decorativo: no hay coverage ni sugerencias serias.

---

## 8. Motor de reglas (el “cerebro” tipo Crestron/Cisco)

Capas:

1. **Templates de espacio**  
   huddle 4p, boardroom 8/12/16, classroom, training, lobby, Crestron Home living, etc.  
   Cada template: tamaño default, mesa, asientos, roles mínimos.

2. **Platform pack**  
   Teams Rooms / Zoom Rooms / BYOD / Crestron Home / .AV Framework-ish.  
   Define codec, touch, licencias conceptuales, constraints.

3. **Brand preference**  
   “preferir Crestron + SoundTube + Atlona” vs “cliente solo Yamaha”.  
   Filtra candidatos del catálogo (visibilidad + stock + `isCrestronHomeCompatible`).

4. **Auto-layout**  
   Heurísticas: display en muro corto, cámara encima/bajo display, mics en techo sobre mesa, clearances.  
   No hace falta ML al inicio; Cisco/Roomly viven de reglas + FOV.

5. **Validaciones**  
   asientos fuera de FOV, mic bajo coverage %, display demasiado chico para distancia, PoE budget (fase avanzada), productos discontinuados.

6. **Completar BOM**  
   cables, mounts, PSUs, licencias, instalación — Soundtec ya piensa en esto en cotizaciones; el builder debe sugerir, no omitir (Crestron Home Configurator admite que su BOM es incompleto).

---

## 9. Puente a cotización y PDF (ventaja competitiva)

Este es el diferencial vs usar solo el tool de Crestron:

```
RoomScene.devices[]
  → aggregate by productId + qty
  → calculatePricesForProducts(clientId)
  → create Quote (projectType, brief auto desde scene meta)
  → QuoteItem[] 
  → QuoteAsset: screenshot iso, top-down, camera POV
  → issueQuote → PDF Soundtec (módulos actuales + sección “Diseño de sala”)
```

### PDF

- Reusar `buildQuoteDocumentHtml` / `buildQuotePdf`.
- Nuevo módulo opcional en `QUOTE_MODULES`: p.ej. `room_design` con renders + plano 2D + tabla de coverage.
- Screenshots vía `renderer.domElement.toDataURL()` (o render offscreen en cliente) subidos como `QuoteAsset`.
- El PDF **sigue siendo tipográfico Soundtec** (logo, ISO, brands strip); el 3D aporta figuras, no reemplaza la plantilla.

### Cotización viva

Mientras se edita la sala, el panel BOM recalcula. Cambiar un display 65→75 actualiza precio al instante. Eso Crestron Room Builder **no** puede hacer con precios Soundtec.

---

## 10. UX propuesta (MVP)

### Modo Wizard (80% de los casos)

1. Tipo de sala  
2. Capacidad / tamaño  
3. Plataforma UC (o Home)  
4. Preferencia de marcas  
5. Auto-generar escena  
6. Ajustar en 3D  
7. Revisar coverage  
8. “Crear cotización”

### Modo Libre (power users)

- Dibujar plano / importar imagen escalada  
- Drag products desde catálogo filtrado  
- Snap a muro/techo/mesa  
- Undo/redo  

### Vistas

- 3D orbit (default)  
- Planta 2D  
- Vista cámara (POV)  
- Split 2D|3D  

Interactividad mínima “3D de verdad”: orbit, pan, zoom, seleccionar, mover, rotar, alturas de montaje. Walk-through first-person = fase 2.

---

## 11. Fases de producto (técnicas, no calendario)

### Fase 0 — Discovery (sin código de producto)

- Elegir 3–5 tipologías de sala que Soundtec vende más.
- Listar 30–50 SKUs hero + dims + FOV aproximado.
- Decidir audiencia: solo admin primero.
- Benchmark interactivo: Cisco Workspace Designer + Roomly + Collab Room Builder (UX, no código).

### Fase 1 — Vertical slice “Boardroom Soundtec”

- Scene JSON + viewport R3D con sala rectangular paramétrica.
- Paleta: mesa, sillas, 1 display, 1 cámara, 1 mic, 1 touch — proxies.
- BOM → crear Quote con precios reales.
- 1 screenshot al PDF como asset.
- **Criterio de éxito:** un vendedor arma una sala y emite COT Soundtec sin Excel.

### Fase 2 — Coverage + templates

- FOV cámara + zonas mic.
- Templates huddle / boardroom / training.
- Warnings y % coverage por zona de asientos.
- Preferencias de marca.

### Fase 3 — Catálogo ancho + portal

- Más proxies / algunos GLB reales.
- Import plano.
- `RoomProject` versionado.
- Acceso portal cliente (read/configure → pedido).

### Fase 4 — Avanzado

- Cable map / PoE (como Cisco).
- Multi-room / piso.
- Import/export JSON interoperable.
- Reglas Crestron Home residencial (distinto de UC).
- AR en celular (opcional, no core).

---

## 12. Qué se necesita (checklist práctico)

### Producto / negocio

- [ ] Tipologías prioritarias y plataformas UC/Home.
- [ ] Quién usa el tool primero (interno vs cliente).
- [ ] Criterios de “sala válida” según Soundtec (no copiar Cisco ciegamente).
- [ ] Legal: no usar assets/branding de Crestron Room Builder; sí usar catálogo licenciado propio.

### Datos

- [ ] Completar dims de SKUs hero (`widthCm`…).
- [ ] Tabla `ProductDesignProfile` (FOV, mount, pattern).
- [ ] Mapeo product → `proxyKey` / `model3dUrl`.
- [ ] Servicios típicos (instalación, cableado) como `QuoteItem` kind SERVICE.

### Diseño / 3D

- [ ] Artista o estudio para 15–40 GLB proxy (o pack comercial + retopo).
- [ ] Spec de materiales y LOD.
- [ ] Hosting de assets (Vercel Blob / CDN) con versionado.

### Ingeniería

- [ ] Dependencias: `@react-three/fiber`, `@react-three/drei`, `three`, (opcional) `zustand`.
- [ ] Dynamic import del canvas (evitar SSR issues en Next).
- [ ] Modelo Prisma `RoomProject`.
- [ ] Actions: save scene, suggest layout, createQuoteFromScene.
- [ ] Tests del motor de coverage y del aggregate BOM (funciones puras).
- [ ] Performance budget: móvil mid-range, &lt;3 s a primera escena interactiva.

### Operación

- [ ] Proceso para alta de nuevo producto “room-builder ready”.
- [ ] QA checklist: escala, coverage, precio, PDF.
- [ ] Capacitación vendedores.

### Equipo (roles, no headcount fijo)

| Rol | Aporte |
| --- | --- |
| Product owner AV | Tipologías, reglas, prioridades de SKU |
| Full-stack (ya conocen Next/Prisma) | App, Quote bridge, PDF |
| Front 3D (R3F) | Viewport, interacción, performance |
| 3D artist (freelance OK al inicio) | Proxies GLB |
| Precios/ops | Validar BOM vs realidad comercial |

Un vertical slice (Fase 1) es abordable por 1–2 devs web + apoyo puntual de arte 3D. Un Cisco-level polished product multi-tipología es un producto completo con fases.

---

## 13. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Obsesión por fotorrealismo | Paraliza MVP | Nivel A/B primero |
| Catálogo sin dims/FOV | Coverage mentiroso | Perfiles manuales en hero SKUs |
| Reglas incompletas | Malas recomendaciones | Warnings + override humano siempre |
| Scope residencial + UC juntos | Complejidad ×2 | Empezar solo UC comercial |
| Performance móvil | Mala UX portal | Proxies, instancing, lazy GLB |
| Confundir con “integrar Crestron tool” | Expectativa falsa | Posicionar como producto Soundtec |
| PDF gigante por muchas imágenes | Emisión lenta | 2–3 renders fijos, comprimidos |

---

## 14. Comparativa de caminos

| Camino | Resultado | Encaje con tu idea |
| --- | --- | --- |
| Solo importar BOM de Crestron | COT rápida, sin 3D propio | Parcial (doc anterior) |
| **Room Builder Soundtec 3D** | Diferenciador, multi-marca, PDF propio | **Este documento** |
| Híbrido | Diseñar en Soundtec; opcional import BOM Crestron como semilla | Recomendado a medio plazo |

El híbrido es sano: el builder propio es el producto; el import de BOM Crestron es un atajo de entrada de datos.

---

## 15. Respuestas directas

**¿Se puede hacer?**  
Sí.

**¿Cómo?**  
Escena JSON + plano 2D + viewport React Three Fiber + catálogo Soundtec + reglas + bridge a Quote/PDF existentes. Assets paramétricos primero, GLB después.

**¿Qué se necesita?**  
Tipologías claras, metadatos de diseño por SKU, librería proxy 3D, motor de reglas, roles de producto/arte/dev 3D, y disciplina de MVP (boardroom primero).

**¿Qué ya tenemos a favor?**  
Catálogo multi-marca, sync Crestron/Sonance/etc., motor de precios, cotizaciones, PDF corporativo, brief/assets de proyecto. Eso es exactamente lo que Crestron Room Builder no te da localizado.

**¿Qué es lo más difícil?**  
No el 3D en sí: **contenido + reglas + datos de cobertura**.

---

## 16. Decisión pedida para el próximo paso

1. ¿Confirmamos scope MVP = **boardroom UC multi-marca** (no Home todavía)?  
2. ¿Audiencia inicial = **solo admin/vendedores**?  
3. ¿Prioridad visual = **paramétrico A/B** (aceptable) o exigís GLB fotorrealistas desde el día 1?  
4. ¿Arrancamos después un **spike técnico** (prototipo R3F de una sala + 4 proxies + botón “crear COT”) sin productizar aún?

Hasta esa decisión, este documento + el de integración Crestron forman la base de investigación. **Sin implementación de producto en este trabajo.**

---

## 17. Referencias

### Benchmarks de producto
- [Cisco Workspace Designer](https://designer.webex.com/) + [novedades Fall 2025](https://blog.webex.com/workspaces/whats-new-cisco-workspace-designer-fall-2025/)
- [Cisco WSD en Three.js Discourse (R3F)](https://discourse.threejs.org/t/cisco-workspace-designer-design-the-perfect-meeting-room-in-3d/81016)
- Crestron Collab Room Builder / Room Designer / Home Configurator (ver doc hermano)
- [Roomly Planner — coverage math](https://roomly.bushtek.com/planner/about)
- [Datavideo Room Designer](https://datavideo.com/eu/product/Datavideo+Room+Designer)
- [Video Room Calculator](https://collabexperience.com/)

### Técnica open source / pipelines
- [Home3D (R3F + Zustand + 2D/3D)](https://github.com/lohith9/Home_View)
- [Gaudi floorplan → 3D](https://github.com/MurtazaKafka/gaudi)
- [Blueprint3D Modern](https://github.com/charmlinn/blueprint3d-modern)
- [IKEA Kreativ-style + BOM](https://github.com/Gojer16/Ikea-Kreativ-Clone)
- [react-arch](https://github.com/react-arch/react-arch)
- [Configurix — asset pipeline CAD→glTF](https://configurix.com/3d-product-configurator-asset-pipeline)
- [BIM → GLB pipeline (referencia)](https://github.com/studio-public-demos/bim-cloud-pipeline)

### Internos Soundtec
- `docs/research/2026-10-08-crestron-room-builder-integracion.md`
- `src/lib/quote-document-html.ts`, `quote-pdf.ts`, `quote-defaults.ts`
- `src/lib/pricing.ts`, `src/server/actions/quick-quote.ts`
- `docs/crestron-web-enrichment.md`
