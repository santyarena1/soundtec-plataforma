/**
 * Ajuste del amoblamiento a la sala real: lo que se sale se mete adentro; lo
 * que igual no entra, o pisa a un mueble más importante, se saca (primero
 * sillas, macetas y mesas auxiliares; nunca la cama o la mesa principal).
 */

import type { ResolvedFurniture } from "./furnishing";
import { pointInPolygon } from "./plan-polygon";

type Pt = { x: number; y: number };

/** Lo que importa más queda; lo de menos prioridad se saca si no entra. */
const PRIORITY: Partial<Record<string, number>> = {
  bed: 10,
  stage: 10,
  sofa: 9,
  "conference-table": 9,
  "round-table": 8,
  "reception-desk": 9,
  "kitchen-counter": 9,
  "bar-counter": 9,
  desk: 8,
  wardrobe: 7,
  bathtub: 8,
  shower: 8,
  toilet: 8,
  vanity: 8,
  "media-console": 6,
  credenza: 6,
  "lounge-chair": 5,
  "coffee-table": 5,
  lectern: 5,
  bench: 4,
  "bench-seat": 4,
  ottoman: 3,
  nightstand: 3,
  "side-table": 2,
  "side-chair": 2,
  chair: 2,
  "bar-stool": 2,
  planter: 1,
  "planter-box": 1,
  "indoor-tree": 1,
};
/** Se apoyan sobre otros (no cuentan como choque). */
const LAYER = new Set(["rug"]);
/** Tolerancia de contacto entre muebles (m). */
const TOUCH = 0.03;
/** Margen a la pared (m). */
const WALL_GAP = 0.02;

function corners(f: ResolvedFurniture): Pt[] {
  const w = f.w ?? 0.6;
  const d = f.d ?? 0.6;
  const c = Math.cos(f.rotY);
  const s = Math.sin(f.rotY);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([lx, lz]) => ({ x: f.x + lx! * c + lz! * s, y: f.z - lx! * s + lz! * c }));
}

/** Separación de ejes: ¿se pisan dos rectángulos girados (con tolerancia)? */
export function overlaps(a: Pt[], b: Pt[], tol = TOUCH): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = -(q.y - p.y);
      const ny = q.x - p.x;
      const len = Math.hypot(nx, ny) || 1;
      const proj = (pts: Pt[]) => pts.map((t) => (t.x * nx + t.y * ny) / len);
      const pa = proj(a);
      const pb = proj(b);
      if (Math.max(...pa) - tol <= Math.min(...pb) || Math.max(...pb) - tol <= Math.min(...pa)) return false;
    }
  }
  return true;
}

function insideFloor(pts: Pt[], floor: Pt[]): boolean {
  return pts.every((p) => pointInPolygon(p, floor));
}

/** Mete adentro, y saca lo que no entra o pisa a algo más importante. */
export function fitFurnitureToRoom(items: ResolvedFurniture[], floor: Pt[]): ResolvedFurniture[] {
  const xs = floor.map((p) => p.x);
  const ys = floor.map((p) => p.y);
  const minX = Math.min(...xs) + WALL_GAP;
  const maxX = Math.max(...xs) - WALL_GAP;
  const minY = Math.min(...ys) + WALL_GAP;
  const maxY = Math.max(...ys) - WALL_GAP;

  // 1) Adentro: correr lo que se sale; si no alcanza, sacarlo.
  const placed = items.map((f) => {
    if (f.hiddenBy || f.mount !== "floor") return f;
    let it = f;
    for (let pass = 0; pass < 3 && !insideFloor(corners(it), floor); pass++) {
      const cs = corners(it);
      const dx = Math.max(0, minX - Math.min(...cs.map((p) => p.x))) - Math.max(0, Math.max(...cs.map((p) => p.x)) - maxX);
      const dz = Math.max(0, minY - Math.min(...cs.map((p) => p.y))) - Math.max(0, Math.max(...cs.map((p) => p.y)) - maxY);
      // En formas en L el recuadro no alcanza: un paso hacia el centro del ambiente.
      const towardCenter = dx === 0 && dz === 0;
      it = towardCenter
        ? { ...it, x: it.x - Math.sign(it.x) * 0.25, z: it.z - Math.sign(it.z) * 0.25 }
        : { ...it, x: Math.round((it.x + dx) * 100) / 100, z: Math.round((it.z + dz) * 100) / 100 };
    }
    return insideFloor(corners(it), floor) ? it : { ...it, hiddenBy: "space" as const };
  });

  // 2) Sin pisarse: se aceptan de mayor a menor prioridad.
  const order = placed
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !f.hiddenBy && f.mount === "floor" && !LAYER.has(f.kind))
    .sort((a, b) => (PRIORITY[b.f.kind] ?? 4) - (PRIORITY[a.f.kind] ?? 4));
  const accepted: Pt[][] = [];
  const out = [...placed];
  for (const { f, i } of order) {
    const box = corners(f);
    if (accepted.some((a) => overlaps(a, box))) {
      out[i] = { ...f, hiddenBy: "space" };
      continue;
    }
    accepted.push(box);
  }
  return out;
}
