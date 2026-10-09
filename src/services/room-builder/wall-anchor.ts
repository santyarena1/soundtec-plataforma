/**
 * Muebles que en la realidad van apoyados contra la pared (cama por la
 * cabecera, mesas de luz, placard, aparadores, mueble de TV, estanterías):
 * se corren hasta tocar la pared que tienen detrás, y las mesas de luz se
 * acomodan pegadas a los costados de la cama, alineadas con la cabecera.
 */

import type { FurnitureItem } from "./furnishing";
import { footprint } from "./furniture-fit";
import { pointInPolygon } from "./plan-polygon";

type Pt = { x: number; y: number };

/** Hasta qué distancia de la pared se considera "va contra la pared" (m), por tipo. */
const AGAINST_WALL: Partial<Record<string, number>> = {
  bed: 1.2,
  nightstand: 0.9,
  wardrobe: 0.9,
  credenza: 0.9,
  "media-console": 0.9,
  shelving: 0.9,
  "kitchen-counter": 0.6,
  vanity: 0.6,
  sofa: 0.5,
};
/** Luz que queda entre el mueble y la pared (zócalo). */
const WALL_GAP_M = 0.015;
/** Separación entre la cama y la mesa de luz (m). */
const NIGHTSTAND_GAP_M = 0.04;
const NIGHTSTAND_REACH_M = 1.2;
/** Giro "a escuadra" (múltiplo de 90°) con esta tolerancia (rad). */
const SQUARE_TOL = 0.05;
const STEP_M = 0.005;
const MAX_RAY_M = 40;

function depthOf(f: FurnitureItem): number {
  const b = footprint(f);
  return Math.hypot(b[3]!.x - b[0]!.x, b[3]!.y - b[0]!.y);
}
function widthOf(f: FurnitureItem): number {
  const b = footprint(f);
  return Math.hypot(b[1]!.x - b[0]!.x, b[1]!.y - b[0]!.y);
}

const isSquare = (rotY: number) => {
  const q = ((rotY % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
  return q < SQUARE_TOL || Math.PI / 2 - q < SQUARE_TOL;
};

/** Distancia desde el centro hasta la pared, hacia atrás del mueble (−z local). */
function distanceBehind(f: FurnitureItem, floor: Pt[]): number {
  const dx = -Math.sin(f.rotY);
  const dz = -Math.cos(f.rotY);
  // Se mide en los dos extremos del lomo y el centro: manda la pared más cercana.
  const half = widthOf(f) / 2 - 0.05;
  const ax = Math.cos(f.rotY);
  const az = -Math.sin(f.rotY);
  let best = MAX_RAY_M;
  for (const s of [-half, 0, half]) {
    const ox = f.x + ax * s;
    const oz = f.z + az * s;
    for (let t = 0; t < MAX_RAY_M; t += STEP_M) {
      if (!pointInPolygon({ x: ox + dx * t, y: oz + dz * t }, floor)) {
        best = Math.min(best, t);
        break;
      }
    }
  }
  return best;
}

/** ¿Está apoyado contra la pared (lomo a menos de 3 cm)? */
export function isAgainstWall(f: FurnitureItem, floor: Pt[]): boolean {
  if (!(f.kind in AGAINST_WALL) || !isSquare(f.rotY)) return false;
  return distanceBehind(f, floor) - depthOf(f) / 2 <= 0.03;
}

/** Apoya contra la pared lo que va contra la pared y arrima las mesas de luz a la cama. */
export function anchorToWalls(items: FurnitureItem[], floor: Pt[]): FurnitureItem[] {
  const snapped = items.map((f) => {
    const reach = AGAINST_WALL[f.kind];
    if (reach == null || f.mount !== "floor" || !isSquare(f.rotY)) return f;
    const gap = distanceBehind(f, floor) - depthOf(f) / 2;
    if (gap <= WALL_GAP_M || gap > reach) return f;
    const move = gap - WALL_GAP_M;
    return { ...f, x: round(f.x - Math.sin(f.rotY) * move), z: round(f.z - Math.cos(f.rotY) * move) };
  });
  const beds = snapped.filter((f) => f.kind === "bed");
  if (!beds.length) return snapped;
  return snapped.map((f) => {
    if (f.kind !== "nightstand") return f;
    const bed = beds.reduce((a, b) => (Math.hypot(b.x - f.x, b.z - f.z) < Math.hypot(a.x - f.x, a.z - f.z) ? b : a));
    if (Math.hypot(bed.x - f.x, bed.z - f.z) > widthOf(bed) / 2 + NIGHTSTAND_REACH_M) return f;
    // Costado de la cama donde está la mesa de luz (x local de la cama).
    const ax = Math.cos(bed.rotY);
    const az = -Math.sin(bed.rotY);
    const side = Math.sign((f.x - bed.x) * ax + (f.z - bed.z) * az) || 1;
    const along = side * (widthOf(bed) / 2 + widthOf(f) / 2 + NIGHTSTAND_GAP_M);
    // Lomo alineado con la cabecera (z local de la cama).
    const back = -depthOf(bed) / 2 + depthOf(f) / 2;
    const bx = -Math.sin(bed.rotY);
    const bz = -Math.cos(bed.rotY);
    return { ...f, rotY: bed.rotY, x: round(bed.x + ax * along - bx * back), z: round(bed.z + az * along - bz * back) };
  });
}

const round = (n: number) => Math.round(n * 1000) / 1000;
