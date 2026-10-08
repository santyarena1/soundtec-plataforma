# Room Builder — cobertura (FOV / alcance): definición de producto

**Fecha:** 2026-10-08  
**Estado:** decisión de producto cerrada por el equipo de diseño (el negocio pidió que lo definamos nosotros)  
**UI:** hablar de **“cobertura”**, no de “FOV” frente al usuario  
**Relacionado:** [`decisiones-cerradas.md`](./2026-10-08-room-builder-decisiones-cerradas.md)

---

## 1. Qué es (definición fija)

| Término interno | En la UI | Qué representa |
| --- | --- | --- |
| FOV horizontal/vertical | Ángulo de cobertura de cámara | Cono/ángulo que “ve” la cámara |
| Alcance máx. cámara | Alcance de cámara | Hasta qué distancia útil se considera la toma |
| Patrón / radio de mic | Cobertura de micrófono | Zona donde el mic recoge bien |
| Viewing distance display | Distancia de visionado | Rango OK para ver esa pantalla |
| Ángulo/cobertura speaker | Cobertura de audio | Zona de escucha estimada |

Valores base vienen del **perfil de diseño** (ficha / sitio oficial).  
Si no hay dato confiable: **no se inventa un cono bonito** — el equipo sigue en ranking por precio/uso, con aviso “sin datos de cobertura”.

---

## 2. Principio de interacción

**Modificable, no libre.**

- Cada equipo nace con cobertura **recomendada** (datasheet).  
- El usuario puede **ajustarla un poco** para el proyecto (sala real ≠ laboratorio).  
- No puede dejar valores absurdos (cámara 5° o 170° a mano, mic que cubre un estadio, etc.).  
- Todo ajuste queda marcado como `override` del proyecto (no pisa el catálogo global).

---

## 3. Qué se puede modificar (con límites)

### Cámara
| Parámetro | Default | Modificable | Límites típicos |
| --- | --- | --- | --- |
| Ángulo horizontal | datasheet | Sí, en pasos (ej. 5°) | ±20% del valor de ficha, y nunca fuera de 30°–120° salvo ficha más extrema |
| Ángulo vertical | datasheet o derivado | Sí, mismo criterio | Acotado igual |
| Alcance (m) | datasheet / default familia | Sí | ±25%, piso 1 m, techo según rol |
| Orientación (yaw) | según slot | Sí, pasos 5°–15° | Dentro del hemisferio del muro/slot |
| Altura de montaje | default del perfil/slot | Sí | Rango del slot (ej. 2.0–3.2 m techo) |

### Micrófono
| Parámetro | Default | Modificable | Límites |
| --- | --- | --- | --- |
| Radio / ancho de zona | ficha / familia | Sí | ±25% |
| Rotación del patrón (si aplica) | slot | Sí, pasos | Acotado al techo/mesa |
| Altura | slot | Sí | Rango del montaje |

### Display
| Parámetro | Default | Modificable | Límites |
| --- | --- | --- | --- |
| Distancia mín/máx de visionado | ficha / heurística por pulgadas | Sí | ±20%; nunca invertir min>max |
| Diagonal | del producto (fija) | **No** (es el SKU) | — |

### Altavoz
| Parámetro | Default | Modificable | Límites |
| --- | --- | --- | --- |
| Ángulo / radio estimado | familia | Sí | ±25% |

**Reset:** botón “Volver a valores de ficha” por equipo.

---

## 4. Varias formas de verlo (sí se implementa)

La cobertura no es un solo dibujo. El usuario elige **cómo verla** (combinable con presets de cámara General / Frente / Planta / Detalle):

| Modo de vista de cobertura | Qué muestra | Para qué |
| --- | --- | --- |
| **Apagada** | Solo equipos, sin overlays | Diseñar sin ruido visual |
| **Conos / zonas** | Cono de cámara, disco/área de mic, banda de visionado del display | Chequeo rápido |
| **Sobre asientos** | Colorea asientos/zonas: OK / justo / fuera | “¿Se ve y se oye a la gente?” |
| **Solo selección** | Cobertura únicamente del equipo seleccionado | Ajustar un mic/cámara sin embudo de colores |
| **Comparar 2** (opcional v1.1) | Dos candidatos en el mismo slot, coberturas lado a lado | Elegir entre A y B |

Indicadores semánticos (no solo color bonito):

- **Óptima** — dentro de rango recomendado  
- **Aceptable** — borde del rango  
- **Insuficiente** — gente/zona fuera  
- **Sin datos** — gris, sin cono inventado  

---

## 5. Cómo entra al ranking

El score de “mejor alcance” usa:

1. Valores **de ficha** (o override del proyecto si el usuario ya ajustó).  
2. Geometría real de la sala (m², mesa, asientos, slots).  
3. % de asientos/zona objetivo cubiertos.

Si `Sin datos` → ese factor no suma (o suma neutro); ganan precio/uso/stock.  
Nunca rankear “alta cobertura” con un FOV inventado.

---

## 6. Persistencia

```ts
// En RoomProject.scene.devices[i]
coverage: {
  source: "datasheet" | "family_default" | "project_override";
  hfovDeg?: number;
  vfovDeg?: number;
  maxRangeM?: number;
  micRadiusM?: number;
  viewMinM?: number;
  viewMaxM?: number;
  // ...
}
```

El `ProductDesignProfile` del catálogo **no se sobrescribe** al ajustar en un proyecto.

---

## 7. UX cotidiana (una frase)

> “La cobertura viene de la ficha; la ves en conos/asientos; la podés retocar un poco; no la podés romper; si no hay dato, te lo dice.”

---

## 8. Checklist

- [x] Definición de cobertura/FOV/alcance en criollo  
- [x] Modificable con límites (no libre)  
- [x] Varios modos de visualización  
- [x] Sin inventar cobertura sin datos  
- [x] Override por proyecto, no global  
- [x] Integrado al ranking de alcance  

Esto queda como especificación para implementación; no requiere más decisión del negocio salvo veto explícito a algún modo de vista.
