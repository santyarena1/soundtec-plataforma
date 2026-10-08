# Room Builder — plano completo, detección de espacios y techo visual (alcance máximo realista)

**Fecha:** 2026-10-08  
**Premisa del negocio:** no limitar por desconocimiento; queremos la herramienta **lo más potente posible**. Las “limitaciones” anteriores eran cautela, no deseo de recortar.  
**Rol de este doc:** decir con honestidad técnica **hasta dónde se puede llegar en web**, qué formatos admitir, y qué es ambicioso-pero-real vs fantasía.

---

## 1. Objetivo que describiste (interpretación)

1. Cargar un **plano de planta entero** (piso de hotel, oficina, etc.).  
2. Verlo en **vista aérea**.  
3. Que el sistema **detecte / proponga espacios** (habitaciones, lobby, oficina, parque…).  
4. **Entrar** a un espacio y colocar productos AV.  
5. Poder **delimitar** zonas (ej. parque) y poner materiales simples (pasto).  
6. Si el fotorrealismo web es viable, **preferirlo**; si no, el máximo look que aguante el browser.  
7. Cotización fina anclada a geometría real.

Eso es un **gemelo ligero de planta + Room Builder por espacio**, no solo “una sala template”.

---

## 2. Respuesta corta: ¿se puede?

**Sí, en capas.** Una web (Next + Three.js / R3F) **sí puede** verse muy bien hoy (Cisco Workspace Designer lo demuestra).  
No puede competir con Unreal/Twinmotion offline en un hotel entero con miles de polígonos y ray tracing.  
El techo correcto es: **PBR pulido + buena iluminación + LODs**, no “película”.

| Nivel visual | ¿Web viable? | Cuándo usarlo |
| --- | --- | --- |
| Esquemático (muros blancos) | Sí, trivial | Fallback / planos malos |
| **PBR-lite / semicerrado** (materiales, pasto, madera, vidrio simple, sombras suaves) | **Sí, objetivo recomendado** | Planta aérea + interior al entrar |
| Fotorrealismo pesado (RTX, vegetación densa, miles de props únicos) | No estable en web multi-piso | Fuera de alcance web |

**Decisión de producto propuesta:**  
- Modo plano/planta: **PBR-lite (el máximo razonable en web)**.  
- Modo template de tipología (huddle/boardroom sin plano): puede ir **aún más pulido** (escena chica = más presupuesto gráfico).  
No nos auto-limitamos a “cajas grises” si la máquina lo aguanta.

---

## 3. Formatos de plano — qué admitir

Orden de utilidad real:

| Formato | ¿Admitir? | Calidad para auto-geometría | Notas |
| --- | --- | --- | --- |
| **DXF** | **Sí, prioritario** | Alta | Vectores, capas, cotas; estándar interoperable |
| **DWG** | Sí (vía conversión) | Alta | Convertir a DXF/glTF en server (ODA/LibreDWG/servicios); no parsear DWG crudo a mano al inicio |
| **PDF vectorial** | Sí | Media-alta | Si tiene vectores reales; multipágina = elegir hoja |
| **PNG / JPG / WebP** | Sí | Media | Requiere calibrar escala + trazo/detección; siempre editable |
| **PDF escaneado** (raster) | Sí | Baja-media | Igual que imagen + OCR opcional de textos |
| **IFC / Revit** | Fase posterior | Muy alta | Potente pero pesado (pipeline BIM); no bloquea v1 del modo plano |
| **SVG** | Sí si exportan | Alta | Menos frecuente en obra AR |

**Recomendación de admisión al usuario final:**  
“Mejor DXF/DWG o PDF vectorial. También imagen/PDF escaneado con calibración.”

**No prometer:** “cualquier cosa mágica sin tocar”.  
**Sí prometer:** cualquier formato de la tabla, con un flujo de **calibrar + corregir** siempre disponible.

---

## 4. Arquitectura de navegación (potente y clara)

```
Proyecto (Hotel Costa)
  └─ Planta / Nivel 1   ← plano cargado (aéreo)
       ├─ Lobby          (detectado o dibujado)
       ├─ Habitación 101
       ├─ Habitación 102
       ├─ Corredor
       ├─ Terraza / Parque  ← material pasto
       └─ …
            └─ al “Entrar”: vista interior del espacio + colocar AV
```

### Vista aérea (piso)
- Plano como textura o vectores bajo la extrusión.  
- Polígonos de espacios coloreados.  
- Click → seleccionar / entrar.  
- Colocar equipos “de piso” (signage en corredor, speakers landscape en parque).

### Vista interior (al entrar)
- Misma geometría, cámara a presets (general / planta / detalle) + zoom.  
- Colocar AV con ranking del catálogo.  
- Cobertura sobre ese espacio real.

### Delimitar
- Herramienta polígono: “esto es Parque”, “esto es Habitación”, “esto es Oficina”.  
- Auto-detect propone; el humano confirma/merge/split.  
- Asignar **tipo de espacio** → sugerir template AV + materiales (pasto, piso wood, alfombra…).

Eso es exactamente “todo lo que se pueda”: detección asistida + control total manual.

---

## 5. Detección automática de habitaciones — alcance real

| Técnica | Resultado esperable |
| --- | --- |
| DXF con layers/closed polylines | Muy bueno si el plano está bien hecho |
| Imagen/PDF raster + vision/IA | Bueno como **propuesta**; errores normales en puertas/muros abiertos |
| PDF vectorial | Intermedio |

**Regla de producto:**  
auto-detect = **borrador**; nunca verdad absoluta.  
UI: “12 espacios detectados — revisá y confirmá”.

Sin eso, la herramienta miente en obra. Con eso, es potente y profesional.

---

## 6. Materiales / parque / pileta

Viable en web sin matar performance:

- Pasto: textura tiled + normal light (no cada brizna).  
- Agua pileta: plano con material simple + opacity.  
- Interior: paredes paint, piso wood/carpet, cielorraso.  
- Props: proxies AV + pocos muebles genéricos por tipo de espacio.

LOD: en vista aérea del piso entero, materiales más simples; al **entrar** a una habitación, subir calidad.

---

## 7. Performance web — límites honestos (no autocensura)

Para que sea “súper potente” **y** usable:

- Un **piso** activo en GPU a la vez (otros niveles se cargan on demand).  
- Habitaciones no seleccionadas: shell (caja + label), detalle al entrar.  
- Instancing de sillas/speakers repetidos.  
- Texturas comprimidas (KTX2/Basis), GLB Draco.  
- Target: desktop interno Soundtec primero (ya decidido); mobile solo review.

Con eso se puede un piso de hotel con 20–40 habitaciones **navegable**.  
Un campus de 20 pisos todos detallados a la vez: no; se pagina por nivel.

---

## 8. Alcance máximo que **sí** podemos apuntar (roadmap potente)

### Núcleo potente (alcanzable)
1. Templates fotorrealistas-lite (escenas chicas).  
2. Proyecto multi-espacio (Hotel, oficina…).  
3. **Carga de planta completa** (DXF/DWG/PDF/imagen).  
4. Vista aérea + detección asistida de espacios + delimitar a mano.  
5. Entrar a espacio + colocar catálogo + cobertura + BOM/COT.  
6. Materiales por tipo de zona (pasto, piso, etc.).  
7. Enrich oficial-first del catálogo.  
8. PBR-lite en planta e interior.

### Extensiones fuertes (después, sin negarlas)
- IFC/Revit.  
- Multi-piso con corte.  
- Auto-detect de más calidad (modelo vision entrenado / partner).  
- Medición de cableado aproximado sobre el plano.  
- Comparar dos revisiones de plano.

### Fuera de web razonable (no prometer)
- Twinmotion-level del hotel entero siempre cargado.  
- Vegetación filmica, gente animada, clima.  
- Reemplazo de estudio de arquitectura.

---

## 9. Relación con “no quiero límites”

| Pedido | Respuesta |
| --- | --- |
| ¿Fotorrealismo si se puede? | **Sí, PBR-lite / alto en escenas chicas; planta completa con LOD** |
| ¿Plano entero + entrar a habitaciones? | **Sí, es el diseño correcto** |
| ¿Detectar espacios solo? | **Sí, asistido + confirmación** |
| ¿Parque con pasto? | **Sí, material de zona** |
| ¿Cualquier formato? | **Los de la tabla §3; DXF/DWG/PDF/imagen. IFC después** |
| ¿Sin límite absoluto? | El único límite es **física del browser + calidad del plano de entrada**; el producto se diseña para el máximo dentro de eso, no para recortar features a propósito |

---

## 10. Orden de construcción (potente, sin mentir el 90–95%)

No es “recortar el sueño”; es **ordenar** para que cada release esté sólido:

1. Fundación catálogo + ranking + templates (en curso).  
2. Proyecto multi-espacio (Hotel hub).  
3. Viewport 3D PBR-lite (template + interior).  
4. **Planta completa:** upload → calibrar → delimitar/detectar → aérea → entrar.  
5. Materiales de zona + BOM fino por geometría.  
6. DWG/IFC y auto-detect avanzado.

El sueño del plano entero **queda dentro del producto**; no se descarta por cautela.  
Se entrega cuando la capa de abajo ya no está a medias.

---

## 11. Indicaciones prácticas para ustedes (planos)

Para que la herramienta rinda al máximo, conviene pedir a arquitectura/cliente:

1. **DXF o DWG** del piso (preferido), o PDF vectorial.  
2. Escala conocida o cota de referencia.  
3. Una hoja = un piso.  
4. Si solo hay escaneo: buena resolución, sin foto torcida.

Nosotros igual aceptamos imagen; solo baja el % de auto-detect.

---

## 12. Cierre

Tu visión (planta entera → aérea → detectar → entrar → colocar → cotizar) es **el norte correcto** de una herramienta potente.  
Web **sí** soporta un look muy alto si se diseña con LOD; no hace falta resignarse a cajas grises.  
Formatos: **DXF/DWG/PDF/imagen** primero; IFC después.  
Detección: **asistida**, siempre corregible.  
Fotorrealismo: **máximo viable (PBR-lite / alto en escenas chicas)**, no Unreal offline.

Eso es el alcance que podemos (y debemos) apuntar.
