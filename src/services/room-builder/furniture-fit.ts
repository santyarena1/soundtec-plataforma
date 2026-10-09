/**
 * Ajuste del amoblamiento a la sala real: lo que se sale se mete adentro; lo
 * que igual no entra, o pisa a un mueble más importante, se saca (primero
 * sillas, macetas y mesas auxiliares; nunca la cama o la mesa principal).
 *
 * "Pisar" sigue las reglas de un mueble real: una silla va metida bajo su
 * mesa, las butacas del cine van sobre la tarima y una sombrilla o una
 * lámpara colgante quedan por encima. Eso no es un choque.
 */

import type { FurnitureItem, ResolvedFurniture } from "./furnishing";
import { pointInPolygon } from "./plan-polygon";
import { isAgainstWall } from "./wall-anchor";

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
  shelving: 7,
  "media-console": 6,
  // Guardado de apoyo: antes se saca el aparador que una silla de la mesa.
  credenza: 1.5,
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
  "floor-lamp": 1,
};

/** Medida real (ancho × profundidad, m) de lo que no trae medida propia. */
const NOMINAL: Partial<Record<string, [number, number]>> = {
  chair: [0.55, 0.55],
  "side-chair": [0.46, 0.46],
  "bar-stool": [0.42, 0.42],
  nightstand: [0.45, 0.4],
  "lounge-chair": [0.82, 0.82],
  lectern: [0.6, 0.5],
  wardrobe: [0.55, 0.7],
  toilet: [0.4, 0.68],
  "coffee-table": [1.1, 0.55],
  planter: [0.55, 0.55],
};
/** Profundidad real de los muebles que solo traen el ancho. */
const NOMINAL_DEPTH: Partial<Record<string, number>> = { sofa: 0.92, credenza: 0.46, "media-console": 0.42, shelving: 0.4 };

/** Bases sobre las que se apoyan otros (alfombra, tarima, escenario). */
const LAYER = new Set(["rug", "riser", "stage"]);
/** Van por encima de la gente: no ocupan el piso. */
const OVERHEAD = new Set(["umbrella", "pendant-lamp"]);
/** Asientos que van metidos en su mesa. */
const SEATS = new Set(["chair", "side-chair", "bar-stool"]);
const TABLES = new Set(["conference-table", "round-table", "desk", "reception-desk", "kitchen-counter", "bar-counter", "coffee-table", "control-console", "lectern"]);
/** Tolerancia de contacto entre muebles (m). */
const TOUCH = 0.03;
/** Margen a la pared (m). */
const WALL_GAP = 0.02;

/** Contorno real del mueble en planta (rectángulo girado). */
export function footprint(f: Pick<FurnitureItem, "kind" | "x" | "z" | "w" | "d" | "rotY" | "scale">): Pt[] {
  const nominal = NOMINAL[f.kind];
  const k = f.kind === "planter" ? (f.scale ?? 1) : 1;
  const w = f.w ?? (nominal ? nominal[0] * k : 0.6);
  const d = f.d ?? NOMINAL_DEPTH[f.kind] ?? (nominal ? nominal[1] * k : 0.6);
  const c = Math.cos(f.rotY);
  const s = Math.sin(f.rotY);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([lx, lz]) => ({ x: f.x + lx! * c + lz! * s, y: f.z - lx! * s + lz! * c }));
}

/** ¿Ocupa piso (cuenta para choques)? */
export function occupiesFloor(f: Pick<FurnitureItem, "kind" | "mount">): boolean {
  return f.mount === "floor" && !LAYER.has(f.kind) && !OVERHEAD.has(f.kind);
}

/** Coseno mínimo entre el frente de una silla y la dirección a su mesa. */
const FACING_MIN = 0.5;

/** ¿La silla mira a esta mesa (su frente apunta al punto más cercano de la mesa)? */
export function seatFaces(seat: FurnitureItem, table: FurnitureItem): boolean {
  const box = footprint(table);
  const xs = box.map((p) => p.x);
  const ys = box.map((p) => p.y);
  const tx = Math.max(Math.min(...xs), Math.min(Math.max(...xs), seat.x));
  const tz = Math.max(Math.min(...ys), Math.min(Math.max(...ys), seat.z));
  const len = Math.hypot(tx - seat.x, tz - seat.z);
  // Centro adentro de la mesa: va metida debajo.
  if (len < 0.05) return true;
  return (Math.sin(seat.rotY) * (tx - seat.x) + Math.cos(seat.rotY) * (tz - seat.z)) / len >= FACING_MIN;
}

/** Sin límite: pueden superponerse en planta (silla metida bajo la mesa que mira). */
export const NO_LIMIT = Number.NEGATIVE_INFINITY;

/** ¿Silla metida bajo la mesa a la que mira? Contra otra mesa o una barra a la espalda, no. */
export function mayOverlap(a: FurnitureItem, b: FurnitureItem): boolean {
  if (SEATS.has(a.kind) && TABLES.has(b.kind)) return seatFaces(a, b);
  if (SEATS.has(b.kind) && TABLES.has(a.kind)) return seatFaces(b, a);
  return false;
}

/** Paso libre entre muebles que no van juntos (m): se puede caminar entre ellos. */
export const PASSAGE_M = 0.4;
/** Entre el respaldo de una silla y la mesa vecina (m). */
export const SEAT_PASSAGE_M = 0.25;
/** Piezas chicas de apoyo (maceta, lámpara, mesita): se arriman a lo que acompañan. */
const SMALL = new Set(["planter", "planter-box", "indoor-tree", "floor-lamp", "side-table", "ottoman"]);
/** Pares que en la realidad van juntos (se tocan). */
const COMPANIONS: Array<[string, string]> = [
  ["bed", "nightstand"],
  ["sofa", "coffee-table"],
  ["lounge-chair", "coffee-table"],
  ["sofa", "sofa"],
  ["sofa", "lounge-chair"],
  ["desk", "credenza"],
  // Hileras: butacas del cine, racks lado a lado, sillas contiguas.
  ["lounge-chair", "lounge-chair"],
  ["rack", "rack"],
  ["chair", "chair"],
  ["side-chair", "side-chair"],
  ["bar-stool", "bar-stool"],
];
const companions = (a: string, b: string) => COMPANIONS.some(([p, q]) => (p === a && q === b) || (p === b && q === a));

/**
 * Separación mínima entre dos muebles (m): 0 si van juntos o están uno al lado
 * del otro contra la misma pared; si no, el paso libre.
 */
export function clearanceBetween(a: FurnitureItem, b: FurnitureItem, floor: Pt[]): number {
  if (mayOverlap(a, b)) return NO_LIMIT;
  if (companions(a.kind, b.kind)) return -TOUCH;
  // Respaldo de una silla contra el pupitre o la mesa vecina: espacio para correrla.
  if ((SEATS.has(a.kind) && TABLES.has(b.kind)) || (SEATS.has(b.kind) && TABLES.has(a.kind))) return SEAT_PASSAGE_M;
  // Pupitres y puestos alineados en fila o enfrentados (mismo giro o girados 180°).
  if (a.kind === "desk" && b.kind === "desk" && Math.abs(Math.sin(a.rotY - b.rotY)) < 0.01) return -TOUCH;
  if (SMALL.has(a.kind) || SMALL.has(b.kind)) return 0;
  if (isAgainstWall(a, floor) && isAgainstWall(b, floor)) return -TOUCH;
  return PASSAGE_M;
}

/** Separación de ejes: ¿se pisan dos rectángulos girados (con tolerancia)? */
export function overlaps(a: Pt[], b: Pt[], tol = TOUCH): boolean {
  if (tol === Number.POSITIVE_INFINITY) return false;
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

/** Lo que se controla contra las paredes: el contorno, o solo el centro si va por encima. */
function outlineOf(f: ResolvedFurniture): Pt[] {
  return OVERHEAD.has(f.kind) ? [{ x: f.x, y: f.z }] : footprint(f);
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
    for (let pass = 0; pass < 3 && !insideFloor(outlineOf(it), floor); pass++) {
      const cs = outlineOf(it);
      const dx = Math.max(0, minX - Math.min(...cs.map((p) => p.x))) - Math.max(0, Math.max(...cs.map((p) => p.x)) - maxX);
      const dz = Math.max(0, minY - Math.min(...cs.map((p) => p.y))) - Math.max(0, Math.max(...cs.map((p) => p.y)) - maxY);
      // En formas en L el recuadro no alcanza: un paso hacia el centro del ambiente.
      const towardCenter = dx === 0 && dz === 0;
      it = towardCenter
        ? { ...it, x: it.x - Math.sign(it.x) * 0.25, z: it.z - Math.sign(it.z) * 0.25 }
        : { ...it, x: Math.round((it.x + dx) * 100) / 100, z: Math.round((it.z + dz) * 100) / 100 };
    }
    return insideFloor(outlineOf(it), floor) ? it : { ...it, hiddenBy: "space" as const };
  });

  // 2) Sin pisarse: se aceptan de mayor a menor prioridad.
  const order = placed
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !f.hiddenBy && occupiesFloor(f))
    .sort((a, b) => (PRIORITY[b.f.kind] ?? 4) - (PRIORITY[a.f.kind] ?? 4));
  const accepted: Array<{ item: ResolvedFurniture; box: Pt[] }> = [];
  const out = [...placed];
  for (const { f, i } of order) {
    const box = footprint(f);
    if (accepted.some((a) => overlaps(a.box, box, -clearanceBetween(a.item, f, floor)))) {
      out[i] = { ...f, hiddenBy: "space" };
      continue;
    }
    accepted.push({ item: f, box });
  }
  return out;
}
