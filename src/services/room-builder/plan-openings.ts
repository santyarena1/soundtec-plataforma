/**
 * Puertas y ventanas de cada sala: las aberturas encontradas en el plano se
 * asignan a la pared del ambiente sobre la que están (en el espesor del muro,
 * del lado de afuera del borde; lo que cae adentro es un mueble y se descarta)
 * y se pasan a metros a lo largo de esa pared.
 */

import type { PlanOpening } from "./plan-segment";
import { pointInPolygon, type PlanPoint } from "./plan-polygon";

/** Abertura en una pared de la sala: metros desde el inicio de la pared (vértice i → i+1). */
export type RoomOpening = { wall: string; kind: "door" | "window"; from: number; to: number };

/** Banda del muro (fracción del lado de la imagen) donde se busca la abertura, del lado de afuera. */
const WALL_BAND = 0.03;
/** Tolerancia hacia adentro (el borde del ambiente puede quedar apenas pasado la cara del muro). */
const INSIDE_TOLERANCE = 0.004;
/** Parte de la abertura que tiene que caer sobre la pared. */
const MIN_OVERLAP = 0.5;
/** Abertura mínima en metros (más chico es ruido). */
const MIN_OPENING_M = 0.45;
const ALIGNED = 1e-3;

export function openingsForRoom(openings: PlanOpening[], polygon: PlanPoint[], floorM: PlanPoint[]): RoomOpening[] {
  if (polygon.length < 3 || polygon.length !== floorM.length) return [];
  const out: RoomOpening[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const horizontal = Math.abs(p.y - q.y) < ALIGNED;
    const vertical = Math.abs(p.x - q.x) < ALIGNED;
    if (!horizontal && !vertical) continue;
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    // Afuera de la sala: el lado del borde que no cae en el piso.
    const outward = horizontal
      ? pointInPolygon({ x: mid.x, y: mid.y + 0.002 }, polygon) ? -1 : 1
      : pointInPolygon({ x: mid.x + 0.002, y: mid.y }, polygon) ? -1 : 1;
    const edgeAt = horizontal ? p.y : p.x;
    const e0 = horizontal ? p.x : p.y;
    const e1 = horizontal ? q.x : q.y;
    const lo = Math.min(e0, e1);
    const hi = Math.max(e0, e1);
    const a = floorM[i]!;
    const b = floorM[(i + 1) % floorM.length]!;
    const wallLen = Math.hypot(b.x - a.x, b.y - a.y);
    for (const o of openings) {
      if (o.horizontal !== horizontal) continue;
      const d = (o.at - edgeAt) * outward;
      if (d < -INSIDE_TOLERANCE || d > WALL_BAND) continue;
      const s = Math.max(o.from, lo);
      const t = Math.min(o.to, hi);
      if (t - s < MIN_OVERLAP * (o.to - o.from)) continue;
      // A metros, a lo largo de la pared (desde el vértice i).
      const f0 = ((s - e0) / (e1 - e0)) * wallLen;
      const f1 = ((t - e0) / (e1 - e0)) * wallLen;
      const from = Math.round(Math.min(f0, f1) * 100) / 100;
      const to = Math.round(Math.max(f0, f1) * 100) / 100;
      if (to - from < MIN_OPENING_M) continue;
      out.push({ wall: `w${i}`, kind: o.kind, from, to });
    }
  }
  // Aberturas superpuestas en la misma pared: se queda la puerta (o la más grande).
  return out
    .sort((x, y) => x.wall.localeCompare(y.wall) || x.from - y.from)
    .filter((o, idx, list) => {
      const prev = list[idx - 1];
      if (!prev || prev.wall !== o.wall || o.from >= prev.to) return true;
      return o.kind === "door" && prev.kind === "window";
    });
}
