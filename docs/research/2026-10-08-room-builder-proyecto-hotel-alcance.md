# Room Builder — vistas de habitación + proyecto “Hotel” (alcance real)

**Fecha:** 2026-10-08  
**Pregunta:** ¿Tiene sentido un flujo Hotel → lobby, comunes, pileta, parque, N habitaciones con tamaños? ¿Es demasiada personalización?

---

## 1. Vistas de **una** habitación (lo que ya está pensado)

Para un espacio tipo `hotel-guest` / suite, las vistas de cámara del builder son:

| Vista | Para qué |
| --- | --- |
| **General** | Toda la habitación (iso / ¾) |
| **Planta** | Planta elevada: cama, TV, control, speakers |
| **Detalle** | Zoom a TV + touch / slot seleccionado |
| *(opcional)* **Frente AV** | Solo si el template tiene pared AV dominante (más típico en VC que en guest room) |

No hay orbit libre: se salta entre estas vistas + zoom/enfocar zona.

Los renders de referencia (mockups, no app real) están en artifacts:
`hotel-room-view-general`, `hotel-room-view-plan`, `hotel-room-view-detail-tv`.

---

## 2. Lo que pedís ahora: un **proyecto Hotel** (varios espacios)

Eso es una **capa arriba** del “una sala”:

```
ProyectoHotel
  ├─ Lobby
  ├─ Espacios comunes (bar / breakfast / meeting)
  ├─ Pileta / pool bar
  ├─ Parque / exteriores
  └─ Habitaciones
       ├─ Standard × N (tamaño S/M/L)
       └─ Suite × M
```

Cada ítem del árbol **reutiliza un template de espacio** (prediseñado).  
La habitación no se dibuja 40 veces a mano: se define el **tipo** + **cantidad** + variantes, y el BOM multiplica.

Mockup de hub: `hotel-project-hub-mockup`.

---

## 3. ¿Es demasiada personalización?

| Enfoque | Personalización | Riesgo | Utilidad real |
| --- | --- | --- | --- |
| Solo salas sueltas | Baja | Quedarse corto para hoteles | Alta para VC / una sala |
| **Proyecto propiedad = árbol de templates + cantidades** | Media (la justa) | Baja si los templates son buenos | **Alta** para hotel / campus / edificio |
| CAD libre de todo el hotel | Muy alta | No se usa; nunca se termina | Baja para ventas |

**Veredicto:** lo que describís **no es “personalización infinita”**: es **composición de prediseños + multiplicadores**. Eso es útil y posible.  
Lo que sería excesivo es dejar dibujar pileta/parque como arquitecto; ahí conviene template “Pileta / exteriores” con slots AV típicos (speakers landscape, displays, rack) y m², no landscape design libre.

---

## 4. Alcance real recomendado (honesto)

### Incluir (vale la pena)
- Entidad **Proyecto** (tipo Hotel / Edificio / Campus).  
- Árbol de **espacios** desde catálogo de templates filtrado por vertical (Hotel).  
- Habitaciones: **tipo × cantidad × tamaño**.  
- BOM **agregado** del proyecto (+ desglose por espacio).  
- Abrir cada espacio en el builder de sala (vistas General/Planta/Detalle).  
- Duplicar tipología de habitación y ajustar AV una vez → aplica a las N.

### No incluir al inicio (aunque el mockup lo sugiera)
- Diseño libre de parque/pileta (mobiliario de jardín ilimitado).  
- Planos arquitectónicos del edificio.  
- Guest app / PMS.  
- 40 escenas 3D únicas distintas (alcanza 1 Standard + 1 Suite).

### Verticales con el mismo patrón
Hotel, oficina (pisos + meeting rooms), educación (aulas × N), residential tower.  
Misma mecánica: proyecto → espacios → cantidades.

---

## 5. Relación con lo ya codeado

Hoy la fundación tiene **templates de espacio sueltos** (`hotel-guest-s`, `hotel-suite-m`, `lobby-m`, etc.).  
Falta el modelo **Proyecto contenedor** (PropertyProject / RoomProject parent) + UI de hub.  
Eso es una capa mediana de producto, no un rewrite: se apoya en templates + ranking + BOM.

---

## 6. Respuesta directa

- **¿Se puede llegar a ese fin?** Sí.  
- **¿Es demasiado?** Solo si pretendemos libertad total de diseño; con prediseños + cantidades es el punto dulce.  
- **¿Se van a usar todas las funciones?** No. El hub Hotel se usará para cotizar paquetes; el 80% del tiempo se abrirá Habitación Standard y Lobby. Pileta/parque pueden ser templates livianos BOM-first.  
- **¿Vale la pena?** Sí para Soundtec si venden hospitality / multi-espacio; si no, el builder de sala suelta alcanza y el “proyecto Hotel” se posterga.
