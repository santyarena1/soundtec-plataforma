# Room Builder — qué necesitamos que definas (y qué no)

**Fecha:** 2026-10-08  
**Premisa de lanzamiento:** cuando esté online, tiene que estar usable al **~90–95%**, no “a medias”.  
**Premisa de datos:** marcas, catálogo (~3000) y documentaciones **ya están en la plataforma**. El inventario de qué SKU tiene spec/PDF/CAD lo hace el equipo/agente sobre la base; **no te lo pedimos a vos**.

---

## Lo que NO te pedimos (ya existe o lo relevamos nosotros)

| Tema | Quién lo resuelve |
| --- | --- |
| Lista de marcas | Ya está en la plataforma |
| Cantidad / listado de productos | Ya está en la plataforma |
| Qué fichas tienen `documents` / `specifications` / dims | **Relevamiento automático** sobre la DB |
| Extracción desde datasheets subidos | Motor de enrich (implementación) |
| Precios, stock, cotización, PDF | Ya existe el stack comercial |
| Proxies 3D genéricos iniciales | Se encargan en implementación (pack estándar de roles) |

---

## Lo único que necesitamos que definas vos

Son **decisiones de producto**, no inventarios. Con esto cerrado se puede construir hacia un lanzamiento serio.

### 1. Tipologías del lanzamiento
¿Qué tipos de sala tienen que estar impecables el día 1?

Ejemplos (elegí / editá):  
`videoconferencia (huddle + boardroom)` · `aula / capacitación` · `habitación de hotel` · `salón de eventos` · `living / Crestron Home` · `lobby`

**Necesitamos:** la lista cerrada del go-live (no “todas las imaginables del futuro”).

### 2. Plataformas a soportar en esas tipologías
¿Teams, Zoom, BYOD, Crestron Home, varias?

**Necesitamos:** cuáles son obligatorias en el lanzamiento.

### 3. Quién usa el Room Builder en el go-live
- Solo equipo Soundtec (admin / vendedores), o  
- También clientes en el portal  

**Necesitamos:** una de las dos (o “interno primero y portal en la misma release” si lo exigís al 90–95%).

### 4. Visibilidad de proyectos modelo
Cuando guardo una sala modelo:  
¿privado + equipo alcanza para el lanzamiento, o también **público / link**?

**Necesitamos:** sí/no a público-link en el día 1.

### 5. Cómo se recomienda (criterio comercial default)
Cuando hay varios productos compatibles, ¿el orden “Recomendado” prioriza qué?

Elegí **una** prioridad principal (las otras quedan como filtros/orden secundario):  
- equilibrado precio + cobertura  
- menor precio  
- máxima cobertura / calidad  
- preferencia de ciertas líneas Soundtec (si aplica, nombrala en una frase)

**Necesitamos:** la regla default del botón “Recomendado”.

### 6. Datos incompletos en coverage
Si un producto no trae FOV/alcance claro en la ficha:  
- **A)** entra igual al ranking de precio/uso, pero **sin** dibujar coverage (o con warning), o  
- **B)** no se ofrece para slots que dependen de coverage hasta completar dato  

**Necesitamos:** A o B.

### 7. Confirmación de APIs
¿Están (o van a estar) disponibles para producción **Serper + un modelo OpenAI fuerte** (recomendación/packs) además del que ya usan para tareas chicas?

**Necesitamos:** sí/no (y si el modelo fuerte preferido tiene nombre, opcional).

---

## Cómo se responde (copiá y completá)

```
1 Tipologías go-live:
2 Plataformas:
3 Usuarios: interno | portal | ambos
4 Proyectos públicos/link en día 1: sí | no
5 Default “Recomendado”:
6 Datos incompletos coverage: A | B
7 Serper + modelo IA fuerte en prod: sí | no
```

Con esas 7 respuestas el relevamiento de **decisiones humanas** queda cerrado.  
El resto (inventario de docs, % de specs, gaps por marca, implementación del enrich, builder, ranking, IA, 3D multi-vista, PDF) es trabajo de construcción + relevamiento técnico sobre lo que ya está subido.

---

## Nota sobre el 90–95%

“90–95% listo al estar online” **no** se logra pidiéndote más listas: se logra  
1) cerrar estas decisiones,  
2) enriquecer/ranquear sobre el catálogo existente,  
3) no publicar hasta que tipologías + ranking + builder + PDF cumplan barra interna de QA.  

Eso es plan de construcción, no más formularios para vos.
