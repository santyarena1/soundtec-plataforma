# Room Builder Soundtec — limitaciones reales, datos existentes y alcance profesional

**Fecha:** 2026-10-08  
**Tipo:** investigación / decisión de producto (sin implementación)  
**Lectura previa:**  
- [`2026-10-08-crestron-room-builder-integracion.md`](./2026-10-08-crestron-room-builder-integracion.md)  
- [`2026-10-08-soundtec-room-builder-3d-propio.md`](./2026-10-08-soundtec-room-builder-3d-propio.md)

> **Plan de implementación concreto** (motor de enriquecimiento ~3000 SKUs + builder vista fija + tipologías):  
> [`2026-10-08-room-builder-implementacion-real.md`](./2026-10-08-room-builder-implementacion-real.md)

**Premisa del negocio:** el producto tiene que nacer **profesional**, no como prototipo descartable. Este documento responde: qué información ya hay, qué limitaciones son reales, qué beneficios concretos da, y hasta dónde puede llegar el alcance sin mentir al usuario ni al cliente final.

---

## 1. Respuesta corta

| Pregunta | Respuesta |
| --- | --- |
| ¿Se puede hacer un Room Builder profesional Soundtec? | **Sí.** |
| ¿La ficha de producto ya alcanza para “armar todo solo”? | **No.** Hay mucha información, pero la mayoría no está en forma de metadatos de diseño espacial. |
| ¿El cuello de botella es el motor 3D? | **No.** El 3D web (R3F) está resuelto en la industria. |
| ¿Qué limita un producto profesional de verdad? | Contenido 3D, extracción/curación de parámetros de diseño desde fichas, reglas multi-marca, y honestidad sobre lo que la simulación garantiza. |
| ¿Vale la pena igual? | **Sí**, porque Soundtec ya tiene lo que Crestron/Cisco no te dan: **catálogo local + precios + cotización + PDF propio**. |

---

## 2. Qué información ya existe en la plataforma (auditoría)

Hay que separar tres capas. Mezclarlas es lo que genera falsas expectativas.

### Capa A — Usable hoy de forma automática (estructurado)

| Dato | Dónde | Sirve para |
| --- | --- | --- |
| Identidad SKU / modelo / marca | `Product.internalSku`, `modelNumber`, `manufacturerItem`, `Brand` | Paleta, matching, BOM |
| Precio / stock / visibilidad | sync + `pricing.ts` | Cotización real del cliente |
| Dimensiones W/H/D + peso (parcial) | `widthCm`, `heightCm`, `depthCm`, `weight` | Caja 3D a escala, logística |
| Tipo de producto / montaje / ecosistemas (heurístico) | `ProductAiProfile` (`productType`, `mountTypes`, `ecosystems`, PoE, HDMI…) | Filtrar candidatos, reglas gruesas |
| Accesorios / incluido en caja / variantes | `AccessoryRelation` | Completar BOM profesional |
| Compatibilidad Crestron Home | `isCrestronHomeCompatible`, marca virtual | Packs residenciales |
| Discontinuados / badges | `isDiscontinued`, `badges` | Evitar recomendar basura |

**Matiz dimensiones:** confiables sobre todo cuando vienen de Crestron.com (parse de specs) y Hall Research (Excel). Sonance sync de shipping es más riesgoso (unidades). SoundTube suele traer peso, no caja. Un Room Builder profesional **debe validar/normalizar dims** antes de usarlas como verdad geométrica.

### Capa B — Existe, pero hay que **extraer/curar** (no está lista para el motor 3D)

| Dato | Dónde vive hoy | Forma real |
| --- | --- | --- |
| Specs técnicas | `Product.specifications` = `[{group?, label, value}]` | Strings del fabricante, no tipados |
| Key features / overview | `keyFeatures`, `htmlContent`, `longDescription` | Texto / HTML |
| Datasheets, manuals | `Product.documents[]` con URL + type | PDF / HTML |
| CAD / Revit / DWG | `documents` (Crestron Resources, SoundTube CAD/BIM, Sonance) | Binarios — **no son GLB** |
| EASE / datos acústicos (SoundTube) | docs por nombre de archivo | Binarios especializados |

Ejemplos de lo que **sí aparece** en specs de fabricantes (según parsers actuales):

- Dimensiones, peso, color, enclosure, IP rating, TAA/BAA  
- Audio: frequency response, impedance, power handling, sensitivity  
- Video/control: HDMI, resolution, PoE (a menudo como texto o badge)  
- Montaje: keywords en ficha / AI profile (`in-ceiling`, `wall`, `surface`…)

Ejemplos de lo que **casi nunca está tipado** aunque a veces figure en el PDF:

- HFOV / VFOV de cámara  
- Viewing distance recomendada de display  
- Patrón de cobertura de mic (cardioid, array lobes, radius)  
- Altura de montaje recomendada  
- Clearances, throw ratio, lux mínimo, reverberación  

El asistente IA ya busca texto tipo `coverage|dispersion|angle` en specs, y el profile saca “hard facts” con regex (IP, watts, ohms, HDMI, mounts, ecosystems). Eso **prueba que la ficha tiene señal** — y también que hoy es **extracción parcial**, no un dataset de diseño de salas.

### Capa C — No existe en el producto (hay que crearlo)

| Pieza | Estado |
| --- | --- |
| `ProductDesignProfile` (FOV, mount height, mic pattern, viewing distance…) | No existe |
| Assets 3D web (`.glb`) ligados al SKU | No existen |
| Escena de sala / RoomProject | No existe |
| Motor de coverage espacial | No existe |
| Motor de reglas de tipología (boardroom, huddle, Home…) | No existe |
| Módulo PDF “diseño de sala” | No existe (sí hay PLAN/PROJECT como imagen) |
| Three.js / R3F en el repo | No existe |

### Conclusión sobre “ya está en los productos”

**Correcto:** hay un corpus enorme de fichas, specs, features y documentos. Eso es una ventaja brutal frente a arrancar de cero.

**Incorrecto:** pensar que ese corpus ya es un Room Builder. Hoy es:

1. **Catálogo comercial rico**, y  
2. **Materia prima** para un pipeline de extracción → perfil de diseño → validación humana → motor 3D.

Un producto profesional asume ese pipeline como parte del alcance, no como “detalle menor”.

---

## 3. Limitaciones reales (las que importan)

### 3.1 Limitaciones de datos (duras)

1. **Specs ≠ parámetros de diseño.** Un label `"Field of View"` en un PDF no es un campo `hfovDeg` consultable. Hay que parsear, normalizar unidades y validar por familia.
2. **CAD/Revit del fabricante no se mete solo en el browser.** Hay conversión (IFC/RVT → mesh optimizado → GLB), derechos de uso, y costo de arte. Sin eso, el 3D profesional usa **proxies tipados a escala real** + SKUs hero con modelo propio.
3. **Cobertura desigual por marca.** Crestron (web enrich) es el más rico; Sonance bueno en portal; SoundTube/Hall más irregulares. El builder no puede exigir el mismo nivel de detalle a todo el catálogo el día uno — pero sí puede **bloquear** productos “no listos para diseño” o marcarlos “solo BOM sin coverage”.
4. **AccessoryRelation no alcanza para instalación completa.** Ayuda con mounts/PSU/in-box; no calcula metros de cable, PoE budget de switch, ni obra civil.
5. **Dims incompletas o mal convertidas** rompen la escala 3D. Sin higiene de datos, el producto se ve amateur aunque el render sea bonito.

### 3.2 Limitaciones físicas / de simulación (hay que comunicarlas)

Un Room Builder profesional **no reemplaza** un estudio acústico ni un commissioning:

| Simula bien | No garantiza |
| --- | --- |
| Geometría de sala y colocación a escala | Acústica real (RT60, noise floor) |
| Cono FOV de cámara (idealizado) | Obstrucciones reales, iluminación, lens distortion fina |
| Zonas de mic por patrón simplificado | Array beamforming real, AEC, DSP tuning |
| Distancia de visionado de display (reglas AVIXA/heurísticas) | Ergonomía completa ni normativa local |
| BOM + precios Soundtec | Que el sistema “funcione” sin integración en obra |

**Implicación de producto:** el UI debe hablar de *“cobertura estimada / guía de diseño”*, no de *“certificado de instalación”*. Eso es lo que hacen tools serios (Roomly, Video Room Calculator, incluso Cisco advierte límites). Mentir acá destruye credibilidad profesional.

### 3.3 Limitaciones de alcance multi-marca

- **Cisco WSD** es profesional porque modela *su* catálogo y *sus* best practices.  
- **Crestron Room Designer** es profesional en Automate VX porque el dominio está cerrado.  
- Soundtec es **distribuidor multi-marca**: eso es ventaja comercial y desventaja de profundidad. No vas a tener el mismo nivel de detalle que el fabricante en *todos* los SKUs.

Alcance profesional realista:

- **Profundo** en líneas core (Crestron UC/Flex/Home + audio SoundTube/Sonance + video Atlona/displays partners).  
- **Amplio pero más liviano** en el resto (colocables, precio, dims, sin coverage fino).

### 3.4 Limitaciones técnicas de plataforma

| Tema | Limitación |
| --- | --- |
| Deploy Vercel | 3D corre en cliente; assets grandes van a CDN/Blob. OK si se diseña bien. |
| PDF actual | Tipográfico HTML→Chromium. Soporta renders como imágenes; no embebe WebGL. Suficiente para propuesta profesional. |
| Mobile | Un tool 3D profesional de diseño suele ser **desktop-first**. Mobile = revisión, no edición pesada. |
| Legal / IP | No reutilizar assets ni matrices propietarias de Crestron/Cisco. Reglas Soundtec + datos de datasheet propio/licenciado. |
| SSR Next | El canvas 3D debe ser client-only (dynamic import). Resuelto en la industria; hay que hacerlo bien. |

### 3.5 Limitaciones de organización (también reales)

Un Room Builder profesional no es solo software: es **operación de contenido**.

- Alguien tiene que aprobar perfiles de diseño de SKUs nuevos.  
- Alguien tiene que mantener templates de tipología cuando cambia el lineup.  
- Cada marca nueva “room-builder-ready” tiene un costo de onboarding de datos.

Sin ese proceso, el software se degrada aunque el código sea excelente.

---

## 4. Beneficios reales (por qué sí hacerlo profesional)

### 4.1 Diferenciación comercial

| Capacidad | Crestron tools | Soundtec Room Builder |
| --- | --- | --- |
| Diseñar sala UC / Home | Sí (su mundo) | Sí (multi-marca Soundtec) |
| Precios LATAM / cliente / márgenes | No | **Sí** |
| Stock Xtrabone / sync | No | **Sí** |
| Cotización + PDF marca Soundtec | No | **Sí** |
| Mezclar Crestron + Sonance + SoundTube + Atlona + displays | No | **Sí** |
| Pedido portal → COT | No | **Sí** (ya existe el puente comercial) |

Eso no es un “nice to have”: es el argumento de venta del producto.

### 4.2 Aceleración del ciclo comercial

- De brief a BOM tipológico con reglas Soundtec.  
- Menos ida y vuelta Excel.  
- Misma fuente de verdad para vendedor, ingeniería ligera y propuesta al cliente.  
- Renders en la COT que hoy se arman a mano o no se mandan.

### 4.3 Aprovechamiento del corpus que ya pagaron

El sync Crestron-web, Sonance, SoundTube, AI profiles y relaciones de accesorios **ya son inversión hecha**. El Room Builder es la capa que convierte esa inversión en diseño espacial + documento comercial, en lugar de dejarla solo en el buscador del catálogo.

### 4.4 Calidad percibida

Un 3D interactivo serio + coverage estimado + PDF Soundtec posiciona a la empresa como fabricante de soluciones, no solo lista de precios. Eso importa en enterprise y educación.

### 4.5 Datos propietarios a futuro

Cada proyecto diseñado genera dataset interno (tipologías que se venden, combos que funcionan, gaps de catálogo). Eso alimenta IA de cotizaciones y compra — ventaja acumulativa que un tool externo no te deja.

---

## 5. Alcance profesional recomendado (qué sí / qué no)

### 5.1 Debe incluir (para merecer el adjetivo “profesional”)

1. **Tipologías reales** que Soundtec vende (no un sandbox vacío): huddle, boardroom, training/classroom, y al menos un pack Crestron Home si el negocio lo pide.  
2. **Escena 2D+3D a escala** con interacción sólida (orbit, selección, move/rotate, alturas de montaje, undo).  
3. **Coverage estimado** para cámara / mic / display en tipologías UC, con leyendas claras de “estimado”.  
4. **Paleta anclada al catálogo vivo** (precio, stock, discontinuado, visibilidad).  
5. **BOM completo Soundtec**: equipos + accesorios relacionados + servicios típicos (instalación, etc.).  
6. **Salida nativa**: `Quote` + PDF corporativo con plano, renders y tabla.  
7. **Pipeline de datos de diseño**: extracción desde `specifications`/docs + curación + estado “listo para Room Builder”.  
8. **Biblioteca visual profesional**: proxies tipados de alta calidad + modelos hero de los SKUs que más se cotizan (no cajas grises de demo).  
9. **Validaciones**: FOV incompleto, asientos fuera de cobertura, display chico, producto sin dims, kit incompatible con plataforma (Teams/Zoom/Home).  
10. **Gobernanza**: quién aprueba un SKU para el builder; versionado de templates.

### 5.2 Puede diferirse sin dejar de ser profesional

- Walk-through VR / AR en obra.  
- Import Revit completo del edificio.  
- Cable map / PoE budget al nivel Cisco WSD.  
- Multi-piso / campus.  
- Fotorrealismo tipo Unreal.  
- Edición pesada en celular.  
- Cada SKU del catálogo con GLB único.

### 5.3 No debería pretender ser

- Sustituto de SIMPL / Construct / commissioning Crestron.  
- Estudio acústico certificado.  
- BIM de arquitectura.  
- Clon visual/legal del Collab Room Builder o del Workspace Designer de Cisco.

---

## 6. Cómo usar la información que “ya está” en un producto profesional

Pipeline obligatorio (esto es alcance, no opcional):

```
Ficha (specs / features / PDF / CAD)
        ↓
Extractor (reglas + LLM asistido)
        ↓
ProductDesignProfile (campos tipados)
        ↓
Revisión humana / confianza por campo
        ↓
Room Builder (solo usa campos con confianza ≥ umbral)
        ↓
Si falta FOV/dims → el producto puede ir al BOM
                 pero no participa del cálculo de coverage
```

### Fuentes por prioridad

1. Campos ya tipados (`widthCm…`, `ProductAiProfile`, relations).  
2. `specifications` label/value con parsers por familia (cámara, mic, display, speaker).  
3. Datasheet PDF (OCR/extracción) para gaps de alto valor.  
4. CAD → GLB solo para SKUs hero / familias.  
5. Default de familia documentado (con flag `inferred`) cuando el datasheet no trae el número.

Un producto profesional **muestra la procedencia** del dato (spec sheet / inferido / curado) en modo ingeniería; al cliente final le muestra el resultado limpio.

---

## 7. Matriz de alcance vs madurez de datos

| Capacidad del builder | ¿Exige GLB por SKU? | ¿Exige FOV tipado? | ¿Datos hoy? |
| --- | --- | --- | --- |
| Colocar equipos a escala (proxy) | No | No | Parcial (dims) |
| BOM + precios + COT/PDF | No | No | **Sí** |
| Sugerir packs por tipología | No | Parcial | Perfiles + reglas nuevas |
| Coverage cámara/mic/display | No | **Sí** | Hay que poblar |
| Vista POV de cámara | Proxy alcanza | Sí (FOV) | Hay que poblar |
| Completar accesorios | No | No | Relations + reglas |
| Look fotorrealista de catálogo | **Sí** | No | No |
| Simulación acústica seria | Modelos + sala | No alcanza | No (fuera de scope) |

Lectura: se puede ser **profesional en comercial + diseño guiado** sin tener GLB de todo el catálogo. No se puede ser profesional en **coverage** sin poblar perfiles de diseño — aunque la materia prima (datasheets) ya esté.

---

## 8. Riesgos de “querer profesional desde el día uno”

| Riesgo | Cómo se manifiesta | Contención |
| --- | --- | --- |
| Scope infinito | UC + Home + acústica + BIM + AR | Fijar tipologías y profundidad por marca |
| 3D lindo / datos flojos | Coverage inventado | Gates de confianza por SKU |
| Esperar CAD de todos | Nunca se lanza | Proxies profesionales + hero SKUs |
| Copiar Cisco/Crestron | Problemas legales + product identity débil | Identidad Soundtec (marcas + PDF + precios) |
| Subestimar curación | El software existe pero el catálogo “no entra” | El pipeline de datos es parte del producto |

“Profesional desde el inicio” significa **calidad de barra alta en un dominio cerrado bien elegido**, no “todas las features de todos los vendors el primer día”.

---

## 9. Beneficio / limitación en una frase cada uno

**Beneficio central:**  
Convertir el catálogo y el motor comercial que Soundtec ya tiene en un diseñador de salas que cierra en cotización y PDF propios — algo que ninguna tool del fabricante hace por ustedes.

**Limitación central:**  
La documentación de producto es abundante pero **no está lista como dataset espacial**; el producto profesional incluye el trabajo de convertir fichas/datasheets/CAD en perfiles de diseño y assets visuales, y debe ser honesto sobre qué parte es simulación estimada.

---

## 10. Posición recomendada de alcance (para decisión)

**Producto profesional v1 (barra alta, dominio cerrado):**

- Tipologías UC comerciales prioritarias (+ Home si es negocio real).  
- 3D interactivo de calidad (proxies + hero models).  
- Coverage estimado con datos curados del catálogo core.  
- BOM multi-marca Soundtec + servicios.  
- Cotización y PDF nativos con renders.  
- Pipeline de extracción/curación desde specs y datasheets existentes.  

**Fuera de v1 aunque sea “cool”:**  
acústica certificada, BIM edificio, AR obra, fotorrealismo total del catálogo, edición móvil completa.

---

## 11. Preguntas que cierran el alcance

1. ¿Cuáles son las 3 tipologías que *tienen* que verse impecables en el lanzamiento?  
2. ¿Cuáles marcas son “coverage obligatorio” vs “solo colocables/BOM”?  
3. ¿El usuario primario es vendedor Soundtec, ingeniero, o cliente final?  
4. ¿Qué nivel de disclaimer de coverage acepta el equipo comercial?  
5. ¿Hay presupuesto/proceso para curación continua de `ProductDesignProfile` y arte 3D?

Sin esas respuestas se puede seguir investigando, pero no se puede acotar un producto profesional de verdad.

---

## 12. Referencias internas de evidencia

- Specs Crestron → dims: `src/services/crestron-web/normalize.ts` (`extractDimensions`)  
- Specs como label/value: `src/services/sync/types.ts` (`NormalizedSpec`)  
- Hard facts AI (mount, PoE, watts…): `src/services/ai-assistant/profile/source.ts`  
- Documents CAD/Revit/spec: `docs/crestron-web-enrichment.md`, SoundTube `normalize.ts`  
- Accesorios: `AccessoryRelation` + `src/services/sync/upsert.ts`  
- PDF COT: `src/lib/quote-document-html.ts`, `quote-defaults.ts`  
- Ausencia de FOV tipado / 3D: auditoría de repo 2026-10-08 (este trabajo)
