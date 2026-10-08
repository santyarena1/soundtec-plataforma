# Room Builder — uso cotidiano, 3D, colocación y pendientes del enrich

**Fecha:** 2026-10-08  
**Tipo:** relevamiento de producto / UX (sin código)  
**Estado:** base para decidir antes de implementar  
**Relacionado:**  
- [`2026-10-08-room-builder-implementacion-real.md`](./2026-10-08-room-builder-implementacion-real.md)  
- [`2026-10-08-room-builder-limitaciones-alcance.md`](./2026-10-08-room-builder-limitaciones-alcance.md)

Este documento responde, en lenguaje de uso diario:

1. Qué queda **pendiente de decidir/entregar** para el enriquecimiento de ~3000 productos.  
2. **Cómo serían los modelados 3D** y cómo se verían los productos.  
3. **Cómo se elige y coloca** un producto (compatibilidad / slots).  
4. **Proyectos modelo** guardables, públicos o privados.  
5. **Alcance de uso cotidiano** (quién hace qué, en qué orden).

---

## 1. Pendientes del enriquecimiento (~3000) — lo que necesitamos de ustedes

Todavía **no se escribe código**. Para poder arrancar el motor después, hace falta cerrar esto:

### 1.1 Decisiones de negocio (bloquean diseño del motor)

| # | Pendiente | Por qué importa | Opciones típicas |
| --- | --- | --- | --- |
| P1 | ~~Lista de marcas core~~ | **Cerrado:** catálogo integral, **todas las marcas**. Ver [`room-builder-catalogo-integral-e-ia.md`](./2026-10-08-room-builder-catalogo-integral-e-ia.md). El enrich corre por oleadas operativas, sin excluir marcas del producto. | — |
| P2 | ¿Review humano de FOV/mic antes de usarlo en coverage? | Calidad vs velocidad | `auto` con disclaimer / cola `needs_review` obligatoria para coverage |
| P3 | Fuentes permitidas | Legal + calidad | Solo URLs ya en ficha + site oficial / también Google amplio |
| P4 | Qué hacer con SKU sin datasheet | Completitud | Default de familia + flag `inferred` / dejar vacío / ocultar del builder |
| P5 | Presupuesto/cuotas Serper + OpenAI | Operación del batch | Confirmar keys y techos mensuales |
| P6 | ¿Quién aprueba perfiles en admin? | Gobernanza | Rol admin / un “data owner” AV |

### 1.2 Entregables de información (no código)

| # | Qué necesitamos | Formato sugerido |
| --- | --- | --- |
| I1 | Export o conteo real: productos activos por marca | Excel o query admin |
| I2 | 10–20 datasheets “ejemplo oro” (cámara, mic, display, touch, speaker) | PDF + SKU Soundtec |
| I3 | Tipologías del primer release comercial | Lista cerrada (VC, hotel, aula…) |
| I4 | Preferencias de plataforma UC | Teams / Zoom / ambas / Home |
| I5 | Criterio de “compatible” por tipología | Reglas en texto (abajo §3) |

### 1.3 Lo que el relevamiento ya dejó resuelto (no está pendiente de inventar)

- Schema conceptual `ProductDesignProfile` (campos + evidencia + status).  
- Pipeline: discovery → fetch → extract → validate → upsert.  
- Reuso de Serper + sync lotes + AI profile como etapa 2.  
- Expectativa realista de cobertura (% por tipo de dato).  

**Pendiente técnico** (cuando pasemos a código, no ahora): connector, UI de review, cron, tests. Eso ya está listado en el doc de implementación.

---

## 2. Modelados 3D — cómo se haría en la práctica

### 2.1 Idea clara

En la escena **sí se ven productos en 3D**. No hace falta (ni conviene) un modelo único artesanal por cada uno de los 3000.

Hay **tres niveles de representación**, todos válidos visualmente en una vista fija profesional:

| Nivel | Qué es | Cuándo se usa | Cómo se ve |
| --- | --- | --- | --- |
| **Proxy de familia** | GLB genérico tipado (`tv_65`, `ptz_camera`, `ceiling_mic`, `touch_10`, `soundbar`, `codec_box`…) escalado a las dims del SKU | La mayoría del catálogo | Se ve el tipo de equipo a escala real + label/logo de marca-modelo al seleccionar |
| **Hero SKU** | GLB específico de un modelo top (ej. un touch Crestron muy vendido) | 20–80 productos prioridad ventas | Se reconoce el producto |
| **Caja paramétrica** | Rectángulo/caja con material + ícono de rol, dims del perfil | Fallback si aún no hay proxy | Correcto en escala; menos “lindo”, nunca roto |

El Room Builder elige automáticamente: `model3dUrl` (hero) → `proxyKey` → caja.

### 2.2 De dónde salen los modelos

1. **Pack de proxies Soundtec** (encargo a artista 3D / librería licenciada + retopo): 25–40 piezas cubren el 90% de roles.  
2. **Hero models** solo para lo que más se cotiza o se muestra al cliente.  
3. **CAD/Revit del fabricante** (si está en `documents`) → conversión puntual a GLB (pipeline aparte, caro; no para 3000).  
4. **Nunca** scrapear modelos 3D de terceros sin licencia.

### 2.3 Qué ve el usuario al trabajar

- Vista fija (isométrica o ¾).  
- La sala con muros/piso/muebles.  
- Cada dispositivo como objeto 3D seleccionable.  
- Al click: ficha lateral (nombre, marca, SKU, precio cliente, warnings).  
- Opcional: badge “cobertura OK / estimada / sin datos”.  

No es un catálogo 3D tipo e-commerce orbitando cada SKU (salvo que más adelante se agregue en la ficha de producto). En el builder, el 3D es **la sala armada**.

### 2.4 Pendientes 3D (para ustedes / diseño)

| # | Pendiente |
| --- | --- |
| D1 | Estilo visual: realista suave vs “product render” limpio corporativo |
| D2 | Cantidad inicial de proxies a encargar (recomendado: ~30) |
| D3 | Lista de 20–40 SKUs hero para modelar aparte |
| D4 | Confirmar vista fija única (iso) vs 2–3 presets de cámara sin orbit libre |

---

## 3. Elegir producto y colocarlo — compatibilidad

Hay dos modos de uso. **Conviene ofrecer ambos**; el default recomendado es el modo B (más guiado, menos error).

### 3.1 Modo A — “Elijo el producto y me dice dónde va”

1. Abrís el catálogo del builder (filtrado por marca/rol/búsqueda).  
2. Seleccionás un producto (ej. cámara PTZ).  
3. La escena **ilumina los slots compatibles** (pared frontal sobre display, etc.).  
4. Los lugares incompatibles quedan atenuados o bloqueados.  
5. Click en un slot válido → se coloca.  
6. Si forzás un lugar dudoso (admin power), warning explícito: “montaje no recomendado / sin FOV / altura fuera de rango”.

### 3.2 Modo B — “Elijo el lugar y me muestra qué puede ir” (recomendado default)

1. La tipología ya trae **slots** (espacios reservados): “Display principal”, “Cámara”, “Mic techo”, “Touch mesa”, “Altavoz”, etc.  
2. Click en un slot vacío.  
3. Se abre el catálogo **ya filtrado** a productos compatibles con ese slot + tipología + plataforma (Teams/Zoom/Home) + tamaño de sala.  
4. Elegís uno → se coloca en 3D y entra al BOM.  
5. Podés “reemplazar” o “quitar”.

Esto es lo más cercano a un uso cotidiano profesional: no pelearse con la geometría libre.

### 3.3 Qué significa “compatible”

Reglas en capas (todas configurables):

| Capa | Ejemplo |
| --- | --- |
| Rol | Slot `camera` solo acepta `designRole=camera` |
| Montaje | Slot techo exige `mountOptions` incluya `ceiling` |
| Plataforma | Sala Teams filtra codecs/touch certificados o pack Soundtec definido |
| Tamaño / distancia | Display con `viewingDistanceMax` insuficiente → incompatible o warning |
| Marca preferida | Soft-filter: prioriza Crestron pero permite Atlona si el usuario amplía |
| Perfil de diseño | Sin dims / sin proxy → se puede listar como “solo BOM” o bloquear según setting |
| Accesorios | Al colocar un display, sugerir mount/cable (`AccessoryRelation`) |

**Respuesta a tu pregunta:**  
Sí vas a poder seleccionar un producto y ver **dónde puede ir**; y también (mejor para el día a día) seleccionar el espacio y ver **qué productos entran**. Compatibilidad = reglas + datos del `ProductDesignProfile`, no magia.

### 3.4 Colocación libre (sin slot)

Para power users: soltar un producto en la sala fuera de slot, con snap a muro/techo/mesa.  
Siempre con validación post-drop (rojo/amarillo/verde).  
En tipologías “modelo” públicas, se puede desactivar la colocación libre para que no se rompa el estándar.

---

## 4. Proyectos modelo — guardar, privacidad, reutilizar

### 4.1 Concepto

Todo lo que armes es un **`RoomProject`**:

- Escena (medidas, muebles, dispositivos, vista).  
- Metadata (nombre, tipología, cliente opcional, notas).  
- Visibilidad.  
- Vínculo opcional a cotización.

### 4.2 Visibilidad (como idea de producto)

| Modo | Quién lo ve | Uso |
| --- | --- | --- |
| **Privado** | Solo el autor (+ admins) | Trabajo en curso / cliente sensible |
| **Equipo / interno** | Vendedores Soundtec | Biblioteca interna de estándares |
| **Público (catálogo Soundtec)** | Portal o link (si se habilita) | “Salas modelo” para inspirar / partir de ahí |
| **Compartido por link** | Quien tenga el slug (patrón parecido a listas `/lista/{slug}`) | Mandar al cliente una preview sin precios o con precios según permiso |

Decisiones pendientes:

| # | Pendiente |
| --- | --- |
| S1 | ¿El primer release incluye público/portal o solo privado+equipo? |
| S2 | ¿El link público muestra precios? (recomendado: no, o solo si hay sesión cliente) |
| S3 | ¿Quién puede publicar un proyecto como “modelo oficial Soundtec”? (rol) |

### 4.3 Flujo cotidiano de proyectos modelo

1. Diseñador/vendedor parte de un **template** (Boardroom M Teams).  
2. Ajusta m², cambia display, mueve un mic.  
3. **Guarda** como “Boardroom 12p — Cliente X” (privado).  
4. O **publica como modelo** “Boardroom 12p estándar Soundtec” (equipo/público).  
5. Otro vendedor abre ese modelo → “Duplicar” → trabaja el suyo → genera cotización.  
6. El modelo original no se ensucia.

Versionado simple v1: `duplicar` + `actualizar cotización`; no hace falta Git de escenas.

---

## 5. Alcance de uso cotidiano (día a día)

### 5.1 Personas

| Persona | Qué hace en el Room Builder |
| --- | --- |
| **Vendedor** | Arma sala con cliente, elige tipología/tamaño, coloca equipos, mira precio, genera COT/PDF |
| **Preventa / ingeniería ligera** | Ajusta slots, revisa coverage, completa accesorios, publica modelos internos |
| **Admin datos** | Corre enrich, aprueba perfiles, carga proxies/hero, mantiene templates |
| **Cliente portal** (fase siguiente) | Parte de un modelo público, personaliza poco, pide cotización / pedido |

### 5.2 Jornada típica del vendedor

```
1. Nuevo proyecto → “Videoconferencia → Boardroom → Mediano (24 m²)” → Teams
2. La escena ya viene armada con slots y un pack sugerido Soundtec
3. Click en slot Display → elige 75" compatible → se ve en 3D y en BOM
4. Click en Cámara → lista filtrada → elige PTZ → coverage estimado se actualiza
5. Agrega un parlante opcional desde catálogo (modo A) → slots posibles se marcan
6. Revisa BOM + total del cliente
7. “Crear cotización” → abre Quote con ítems y render de la vista fija
8. Emite PDF Soundtec / lo manda al cliente
9. Guarda el proyecto privado vinculado a ese cliente
```

### 5.3 Jornada típica del admin de datos

```
1. Lanza lote design-enrich (marca Crestron, 200 SKUs)
2. Revisa cola needs_review (FOV dudosos, dims faltantes)
3. Aprueba / corrige / marca inferred
4. Asigna proxyKey a una familia nueva
5. Publica o actualiza un “proyecto modelo” oficial Boardroom L
```

### 5.4 Lo que el uso cotidiano NO es

- No es dibujar planos arquitectónicos desde cero cada vez (partís de template).  
- No es rotar la cámara libremente (vista fija estable).  
- No es certificar acústica.  
- No es reemplazar la visita técnica / commissioning.

---

## 6. Mapa mental del producto (para alinear expectativas)

```
[Enrich 3000 SKUs] → ProductDesignProfile (datos + confianza)
        ↓
[Proxies + hero GLB] → cómo se VE cada producto
        ↓
[Templates tipología S/M/L + m²] → sala base
        ↓
[Slots + reglas de compatibilidad] → dónde puede ir cada cosa
        ↓
[RoomProject privado/equipo/público] → guardar y reutilizar
        ↓
[BOM + Quote + PDF] → cierre comercial Soundtec
```

---

## 7. Resumen de pendientes (checklist para la próxima charla)

### Enrich
- [ ] P1 Marcas core del primer lote  
- [ ] P2 Política auto vs review humano  
- [ ] P3 Fuentes permitidas  
- [ ] P4 Política SKU sin datasheet  
- [ ] P5 Cuotas Serper/OpenAI  
- [ ] P6 Quién aprueba perfiles  
- [ ] I1 Conteo real por marca  
- [ ] I2 Datasheets oro de ejemplo  

### 3D
- [ ] D1 Estilo visual  
- [ ] D2 Cantidad de proxies  
- [ ] D3 Lista hero SKUs  
- [ ] D4 Presets de cámara fija  

### Colocación / compatibilidad
- [ ] Confirmar default: modo B (slot → productos) + modo A disponible  
- [ ] I5 Reglas de compatible por tipología (texto del equipo AV)  

### Proyectos
- [ ] S1 Visibilidades del primer release  
- [ ] S2 Precios en link público  
- [ ] S3 Quién publica modelos oficiales  

### Tipologías
- [ ] I3 Lista cerrada primer release  
- [ ] I4 Plataformas UC/Home  

---

## 8. Posición recomendada (para no trabarnos)

Mientras cierran P1–P6 e I1–I5:

1. **Enrich:** primer diseño operativo = marcas core + review de coverage + defaults de familia.  
2. **3D:** vista fija + ~30 proxies + pocos hero; el resto caja/proxy escalado.  
3. **UX:** default **slot → productos compatibles**; secundario producto → slots.  
4. **Proyectos:** v1 **privado + equipo**; público/link en cuanto el flujo interno esté sólido.  
5. **Uso:** vendedor parte siempre de template, no de sala en blanco.

Cuando respondan el checklist §7, el relevamiento de esta parte queda cerrado y se puede pasar a implementación por etapas (enrich primero, builder después), sin ambigüedad de alcance.

**Sin código en este paso** — solo relevamiento y alcance de uso.
