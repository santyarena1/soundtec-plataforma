# Room Builder — decisiones cerradas (input del negocio)

**Fecha:** 2026-10-08  
**Fuente:** respuesta del usuario en relevamiento  
**Estado:** decisiones de producto registradas; listo para plan de construcción al ~90–95%  
**Relacionado:** [`2026-10-08-room-builder-decisiones-requeridas.md`](./2026-10-08-room-builder-decisiones-requeridas.md)

---

## 1. Respuestas registradas

| # | Tema | Decisión |
| --- | --- | --- |
| 1 | Tipologías / ambientes | **Máximo alcance desde el día 1**: todos los tipos de sala/ambiente que el producto pueda cubrir (no un subconjunto mínimo). |
| 2 | Plataformas | Implícito en tipologías máximas: soportar las plataformas que correspondan a cada ambiente (UC Teams/Zoom/BYOD, Crestron Home / residencial, etc.) donde aplique. |
| 3 | Usuarios go-live | **Solo Soundtec, todo interno** al principio. Sin portal cliente en el lanzamiento. |
| 4 | Proyectos públicos / link | **No** en el lanzamiento (solo uso interno). |
| 5 | Ranking “Recomendado” | **No dejar defaults flojos al principio**: el ranking tiene que funcionar de verdad (precio, compatibilidad, uso, alcance). No publicar con un default placeholder. La UI permite ordenar; el score compuesto debe estar calibrado, no “inventar un default y listo”. |
| 6 | Datos incompletos / FOV | El negocio pidió que **lo definamos nosotros**. Spec completa: [`room-builder-cobertura-fov.md`](./2026-10-08-room-builder-cobertura-fov.md). Resumen: UI dice “cobertura”; valores de ficha; **modificable con límites** (no libre); **varias formas de verla** (conos, asientos, solo selección); sin inventar si no hay dato. |
| 7 | IA | **Sí** a todo lo necesario de IA para extract, ranking explicado y packs. |
| 7b | Serper | **No es fuente de verdad.** Casi todos los productos tienen link a sitio oficial (bancos de fotos / ficha). La recuperación parte de ahí. Serper solo apoyo opcional de descubrimiento si falta URL, nunca verdad canónica. |

---

## 2. FOV / alcance — explicación simple (para el equipo)

No es jerga obligatoria en la UI; en el producto se puede decir **“cobertura”** o **“alcance de visión/audio”**.

| Concepto | En criollo | Para qué sirve en el Room Builder |
| --- | --- | --- |
| **FOV** (Field of View) | El “ángulo de visión” de una **cámara**: qué tan ancho ve. | Saber si esa cámara “ve” toda la mesa o se quedan personas afuera. |
| **Alcance / cobertura** | Hasta dónde llega bien una cámara, un mic o la distancia cómoda de ver una pantalla. | Elegir el equipo **adecuado al tamaño** de la sala, no solo “una cámara cualquiera”. |
| **Viewing distance** (pantallas) | A qué distancia se ve bien ese display. | Evitar un TV chico en un boardroom grande (o al revés). |

Ejemplo: en una sala de reuniones larga, una cámara con poco ángulo deja los costados afuera; el builder debería preferir otra con más cobertura o avisarte.

Eso es lo que alimenta el ranking de “mejor alcance” — con números sacados de la **ficha/sitio oficial**, no inventados.

---

## 3. Fuente de verdad de datos de producto (decisión técnica de producto)

Orden obligatorio de enriquecimiento:

```
1. documents[] + specifications[] + dims ya en Soundtec
2. vendorProductUrl / link oficial del fabricante (ficha, recursos, fotos)
3. Parsers / IA de extracción sobre ese contenido
4. Serper u otros buscadores: SOLO si no hay URL oficial
   → hallazgo debe validarse contra página oficial antes de persistir
5. Nunca: Serper como verdad final de FOV/dims/specs
```

Alineado a lo que ya hace bien `crestron-web` (sitio oficial) y a que “casi todos tienen link”.

---

## 4. Alcance máximo de tipologías (día 1) — catálogo cerrado grande

“Todas las que se puedan tener” se traduce a una **lista cerrada amplia** (versionable), no a un generador infinito. Propuesta de go-live interno:

### Corporativo / UC
- Huddle / phone room  
- Boardroom / sala de directorio  
- Sala de reuniones mediana/grande  
- Training / sala de capacitación  
- Aula / classroom  
- Lobby / recepción  
- Open desk / focus (si hay lineup)  

### Eventos / educación extendida
- Salón de eventos / banquet  
- Auditorio chico / medium  

### Hospitality / residencial
- Habitación de hotel  
- Suite  
- Living / media room (Crestron Home)  
- Comedor / multipropósito residencial  

### Otros ambientes frecuentes AV
- Control room / sala técnica (BOM-first)  
- Digital signage / corridor display  

Cada tipología trae tamaños S/M/L o m² y slots propios.  
Si el negocio quiere **sacar** alguna de esta lista antes del go-live, se marca acá; si no, esta es la barra “máxima día 1”.

---

## 5. Implicaciones para el 90–95% online

| Área | Barra |
| --- | --- |
| Usuarios | Solo interno Soundtec |
| Tipologías | Lista §4 implementada y usable (no stub) |
| Datos | Enrich priorizando links oficiales; cobertura sin inventar |
| Ranking | Score real (precio, compatibilidad, uso, alcance); sin default vacío |
| IA | Activa para extract + explicación + packs |
| Serper | No crítico para go-live si las URLs oficiales están |
| Portal / público | Fuera del lanzamiento |

---

## 6. Checklist humano — cerrado

- [x] Tipologías: máximas día 1 (lista §4)  
- [x] Usuarios: solo interno Soundtec  
- [x] Públicos: no en día 1  
- [x] Sin defaults flojos en ranking  
- [x] FOV/alcance definido por producto (modificable acotado + multi-vista); sin coverage inventado  
- [x] IA: sí  
- [x] Serper: no fuente de verdad; oficial primero  

**Siguiente paso (cuando autoricen construcción):** relevamiento técnico en DB (`vendorProductUrl`, `documents`, specs por marca) + implementación del enrich oficial-first + builder interno con tipologías §4.
