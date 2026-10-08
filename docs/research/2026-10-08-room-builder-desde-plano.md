# Room Builder — cargar plano real → 3D básico (versión posterior)

**Fecha:** 2026-10-08  
**Estado:** alcance de producto para **una versión después** del builder por templates  
**Relacionado:** tipologías prediseñadas (fotorrealismo OK) + proyecto Hotel multi-espacio

---

## 1. Qué pediste

- Poder **cargar un plano** (imagen/PDF de arquitectura).  
- A partir de eso, generar un **modelo 3D básico** (no fotorrealista obligatorio).  
- Ver **dimensiones reales**, ubicaciones de objetos AV.  
- Servir para una **cotización más fina** contra la realidad de obra.  
- Los templates “bonitos” que ya vimos pueden ir **más fotorrealistas**; el camino plano es el de **precisión**.

---

## 2. Dos modos del producto (conviven)

| Modo | Visual | Para qué |
| --- | --- | --- |
| **A — Template** (lo actual en el plan) | 3D más fotorrealista / proxy hero | Venta rápida, tipologías, packs, hotel × N habitaciones |
| **B — Desde plano** (esta spec) | 3D esquemático (muros extruidos, cajas, proxies) | Obra real, m² reales, posiciones reales, COT fina |

No compiten: el vendedor elige según el caso.  
Un proyecto Hotel puede mezclar: habitaciones en modo A (×40) + lobby/comunes en modo B si hay plano.

---

## 3. Flujo “Desde plano” (alcance real)

```
1. Cargar plano (PNG/JPG/PDF página)
2. Calibrar escala (dos clicks + “esto mide X metros”)
3. Definir/ajustar perímetro
   - auto-detect muros (best effort) + corrección manual
   - o trazar muros sobre el plano
4. Extrusión 3D básica (alto libre editable, default 2.7 m)
5. Colocar slots/equipos AV sobre el plano (mismas reglas de ranking)
6. Ver 3D esquemático + planta
7. BOM + cotización con cantidades ancladas a ese layout
```

### Qué es “3D básico” (suficiente)

- Muros blancos / piso gris  
- Muebles genéricos opcionales (cama/mesa como cajas)  
- Equipos = proxies/cajas a escala  
- Cotas en metros  
- Sin materiales PBR ni iluminación cinematográfica  

### Qué no es (fuera de esta versión)

- Import Revit/IFC completo del edificio  
- Reconocimiento mágico perfecto de todos los muros sin calibrar  
- Fotorrealismo del plano escaneado  
- Sustituto de AutoCAD

---

## 4. Datos que salen para cotizar mejor

- Área útil real (m² calibrados)  
- Distancias reales display↔asientos / cámara↔mesa  
- Cantidad de zonas / habitaciones si el plano es un piso  
- Lista de equipos con posición (evidencia para el cliente: “va acá”)  
- Cobertura recalculada con geometría real (no solo template S/M/L)

Eso es el valor: **menos supuesto, más anclado al plano del cliente**.

---

## 5. Factibilidad

| Pieza | Dificultad | Notas |
| --- | --- | --- |
| Upload + storage (Blob) | Baja | Ya hay patrón Blob en cotizaciones |
| Calibrar escala | Baja | UX clara, crítica para que no mienta |
| Trazar/editar muros 2D | Media | Canvas 2D sobre imagen |
| Auto-detect muros desde imagen | Media-alta | Best effort + siempre editable a mano |
| Extrusión Three.js | Media | Misma stack R3F; look esquemático a propósito |
| Colocar AV + ranking | Baja | Reusa fundación actual |
| PDF con plano + 3D esquemático | Baja-media | Renders + imagen del plano en la COT |

**Veredicto:** útil y posible como **versión 2** (o fase explícita post go-live interno de templates).  
No bloquea el lanzamiento por tipologías; lo **potencia** cuando hay plano de obra.

---

## 6. Orden de producto recomendado

1. **Ahora / v1 interno:** templates (+ fotorrealismo mejorable) + ranking + proyecto Hotel por cantidades.  
2. **v2:** Desde plano (calibrar → extruir → colocar → COT).  
3. **Después:** auto-detect más fino, multi-piso, import DXF si el mercado lo pide.

Intentar plano+fotorrealismo+Hotel×N+enrich 3000 todo junto en el primer online **rompe** la barra del 90–95%. Separar modos es lo sano.

---

## 7. Decisión registrada

- Sí al feature **cargar plano → 3D básico**.  
- Visual del modo plano: esquemático OK.  
- Visual del modo template: puede ir a más fotorrealismo.  
- Objetivo: cotización más fina vs realidad de obra.  
- Timing: **versión posterior** a la base por templates, no reemplazo.
