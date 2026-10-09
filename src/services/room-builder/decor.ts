/**
 * Ambientación automática según la sala real: cuadros en los tramos de pared
 * libres (sin puertas, ventanas, pantallas ni muebles altos), lámparas de pie
 * junto a sillones y plantas en esquinas libres. Todo se calcula sobre la
 * forma real del ambiente, así se adapta a cualquier tamaño o plano.
 */

import type { FurnitureItem, ResolvedFurniture } from "./furnishing";
import { footprint, occupiesFloor, overlaps } from "./furniture-fit";
import { pointInPolygon } from "./plan-polygon";

type Pt = { x: number; y: number };

/** Pared con los tramos ocupados (metros desde `a`). */
export type DecorWall = { a: Pt; b: Pt; blocked: Array<[number, number]> };

export type DecorInput = {
  category: string;
  templateKey: string;
  floor: Pt[];
  walls: DecorWall[];
  /** Muebles ya resueltos (visibles). */
  items: ResolvedFurniture[];
  /** Equipos montados en pared (posición en planta). */
  wallDevices: Pt[];
};

/** Lado (z local) que da a la pared más cercana. */
function wallSide(table: FurnitureItem, floor: Pt[]): 1 | -1 {
  const ax = Math.sin(table.rotY);
  const az = Math.cos(table.rotY);
  const reachOf = (sign: number) => {
    for (let t = 0.1; t < 30; t += 0.1) if (!pointInPolygon({ x: table.x + ax * sign * t, y: table.z + az * sign * t }, floor)) return t;
    return 30;
  };
  return reachOf(1) <= reachOf(-1) ? 1 : -1;
}

/** Ambientes donde no van cuadros (oscuros, técnicos o húmedos). */
const NO_ART = new Set(["control-room", "event"]);
const NO_ART_TEMPLATES = new Set(["residential-cinema-m", "restroom-s", "hotel-pool-bar-m", "residential-outdoor-m"]);
const OUTDOOR = new Set(["hotel-pool-bar-m", "residential-outdoor-m"]);
/** Muebles altos que tapan la pared que tienen detrás. */
const TALL = new Set(["wardrobe", "shelving", "rack", "kitchen-counter", "video-wall", "backdrop", "stage", "control-console", "signage-totem", "shower", "bathtub", "vanity"]);
/** Sillones: llevan lámpara de pie al costado (una butaca suelta no, quedaría en medio de la sala). */
const SEATING = new Set(["sofa"]);
const PLANT_KINDS = new Set(["planter", "planter-box", "indoor-tree"]);

/** Margen a esquinas y entre objetos de pared (m). */
const WALL_END_M = 0.45;
const OPENING_PAD_M = 0.2;
const DEVICE_HALF_M = 0.65;
const DEVICE_TO_WALL_M = 0.35;
const TALL_TO_WALL_M = 0.7;
const ART_MIN_SPAN_M = 1.3;
const ART_MAX_W = 1.4;
const ART_Y = 1.55;
const MAX_ART = 2;
const MAX_LAMPS = 2;
const LAMP_SIZE = 0.4;
const CORNER_INSET_M = 0.42;
const CORNER_CLEAR_M = 0.75;
const MAX_CORNER_PLANTS = 2;
/** Ambientes chicos: menos objetos sueltos. */
const SMALL_ROOM_M2 = 12;

const r2 = (n: number) => Math.round(n * 100) / 100;

function corners(f: Pick<FurnitureItem, "x" | "z" | "w" | "d" | "rotY">): Pt[] {
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

function area(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Normal hacia adentro de la pared (probando un paso a cada lado). */
function inwardNormal(w: DecorWall, floor: Pt[]): Pt {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
  const n = { x: -(w.b.y - w.a.y) / len, y: (w.b.x - w.a.x) / len };
  const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
  return pointInPolygon({ x: mid.x + n.x * 0.1, y: mid.y + n.y * 0.1 }, floor) ? n : { x: -n.x, y: -n.y };
}

/** Proyección de un punto sobre la pared: distancia a ella y posición a lo largo. */
function project(p: Pt, w: DecorWall) {
  const ex = w.b.x - w.a.x;
  const ey = w.b.y - w.a.y;
  const len = Math.hypot(ex, ey) || 1;
  const along = ((p.x - w.a.x) * ex + (p.y - w.a.y) * ey) / len;
  const dist = Math.abs((p.x - w.a.x) * ey - (p.y - w.a.y) * ex) / len;
  return { along, dist, len };
}

/** Tramos libres de una pared, de mayor a menor. */
export function freeSpans(w: DecorWall, input: Pick<DecorInput, "items" | "wallDevices">): Array<[number, number]> {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const blocked: Array<[number, number]> = w.blocked.map(([f, t]) => [f - OPENING_PAD_M, t + OPENING_PAD_M]);
  for (const d of input.wallDevices) {
    const p = project(d, w);
    if (p.dist <= DEVICE_TO_WALL_M) blocked.push([p.along - DEVICE_HALF_M, p.along + DEVICE_HALF_M]);
  }
  for (const f of input.items) {
    const wallThing = f.mount === "wall" || TALL.has(f.kind);
    if (!wallThing) continue;
    const reach = f.mount === "wall" ? DEVICE_TO_WALL_M : TALL_TO_WALL_M;
    const ps = footprint(f).map((c) => project(c, w));
    if (Math.min(...ps.map((p) => p.dist)) > reach) continue;
    blocked.push([Math.min(...ps.map((p) => p.along)) - 0.15, Math.max(...ps.map((p) => p.along)) + 0.15]);
  }
  blocked.sort((p, q) => p[0] - q[0]);
  const spans: Array<[number, number]> = [];
  let cursor = WALL_END_M;
  for (const [f, t] of blocked) {
    if (f > cursor) spans.push([cursor, Math.min(f, len - WALL_END_M)]);
    cursor = Math.max(cursor, t);
  }
  if (cursor < len - WALL_END_M) spans.push([cursor, len - WALL_END_M]);
  return spans.filter(([f, t]) => t - f > 0).sort((p, q) => q[1] - q[0] - (p[1] - p[0]));
}

function wallArt(input: DecorInput): FurnitureItem[] {
  if (NO_ART.has(input.category) || NO_ART_TEMPLATES.has(input.templateKey)) return [];
  const candidates = input.walls
    .map((w, i) => ({ w, i, span: freeSpans(w, input)[0] }))
    .filter((c): c is { w: DecorWall; i: number; span: [number, number] } => !!c.span && c.span[1] - c.span[0] >= ART_MIN_SPAN_M)
    .sort((p, q) => q.span[1] - q.span[0] - (p.span[1] - p.span[0]));
  const max = area(input.floor) < SMALL_ROOM_M2 ? 1 : MAX_ART;
  return candidates.slice(0, max).map(({ w, i, span }, k): FurnitureItem => {
    const free = span[1] - span[0];
    const width = r2(Math.min(ART_MAX_W, free * 0.55));
    const at = (span[0] + span[1]) / 2;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const n = inwardNormal(w, input.floor);
    const x = w.a.x + ((w.b.x - w.a.x) / len) * at + n.x * 0.03;
    const z = w.a.y + ((w.b.y - w.a.y) / len) * at + n.y * 0.03;
    return {
      id: `decor-art-${i}`,
      kind: "wall-art",
      group: "Cuadros",
      x: r2(x),
      y: ART_Y,
      z: r2(z),
      rotY: Math.atan2(n.x, n.y),
      mount: "wall",
      w: width,
      h: r2(Math.min(0.9, width * 0.7)),
      d: 0.04,
      variant: i + k,
    };
  });
}

/** ¿Un objeto nuevo entra sin pisar nada y dentro de la sala? */
function fits(box: Pt[], solids: Pt[][], floor: Pt[]): boolean {
  return box.every((p) => pointInPolygon(p, floor)) && !solids.some((s) => overlaps(s, box));
}

function floorLamps(input: DecorInput, solids: Pt[][]): FurnitureItem[] {
  if (OUTDOOR.has(input.templateKey) || input.category === "control-room" || input.category === "event") return [];
  const out: FurnitureItem[] = [];
  for (const s of input.items.filter((f) => SEATING.has(f.kind) && f.mount === "floor")) {
    if (out.length >= MAX_LAMPS) break;
    const box0 = footprint(s);
    const w = Math.hypot(box0[1]!.x - box0[0]!.x, box0[1]!.y - box0[0]!.y);
    const d = Math.hypot(box0[3]!.x - box0[0]!.x, box0[3]!.y - box0[0]!.y);
    const c = Math.cos(s.rotY);
    const sn = Math.sin(s.rotY);
    for (const side of [1, -1]) {
      const lx = side * (w / 2 + LAMP_SIZE / 2 + 0.06);
      const lz = -d / 2 + LAMP_SIZE / 2 + 0.05;
      const lamp = { x: r2(s.x + lx * c + lz * sn), z: r2(s.z - lx * sn + lz * c), rotY: s.rotY, w: LAMP_SIZE, d: LAMP_SIZE };
      const box = corners(lamp);
      if (!fits(box, solids, input.floor)) continue;
      out.push({ id: `decor-lamp-${s.id}`, kind: "floor-lamp", group: "Lámparas de pie", mount: "floor", ...lamp, variant: out.length });
      solids.push(box);
      break;
    }
  }
  return out;
}

function cornerPlants(input: DecorInput, solids: Pt[][], doors: Pt[]): FurnitureItem[] {
  if (input.category === "control-room" || input.category === "event" || input.templateKey === "restroom-s") return [];
  const existing = input.items.filter((f) => PLANT_KINDS.has(f.kind)).length;
  // Completa hasta el total del ambiente contando las plantas que ya trae.
  const max = (area(input.floor) < SMALL_ROOM_M2 ? 1 : MAX_CORNER_PLANTS) - existing;
  if (max <= 0) return [];
  const out: FurnitureItem[] = [];
  const poly = input.floor;
  for (let i = 0; i < poly.length && out.length < max; i++) {
    const prev = poly[(i - 1 + poly.length) % poly.length]!;
    const p = poly[i]!;
    const next = poly[(i + 1) % poly.length]!;
    const u = { x: prev.x - p.x, y: prev.y - p.y };
    const v = { x: next.x - p.x, y: next.y - p.y };
    const lu = Math.hypot(u.x, u.y) || 1;
    const lv = Math.hypot(v.x, v.y) || 1;
    const at = { x: p.x + (u.x / lu + v.x / lv) * CORNER_INSET_M, y: p.y + (u.y / lu + v.y / lv) * CORNER_INSET_M };
    if (!pointInPolygon(at, poly)) continue; // esquina entrante (L)
    const crowded = input.items.some((f) => Math.hypot(f.x - at.x, f.z - at.y) < CORNER_CLEAR_M);
    if (crowded || doors.some((d) => Math.hypot(d.x - at.x, d.y - at.y) < 1.1)) continue;
    const plant = { x: r2(at.x), z: r2(at.y), rotY: 0, w: 0.5, d: 0.5 };
    const box = corners(plant);
    if (!fits(box, solids, poly)) continue;
    out.push({ id: `decor-plant-${i}`, kind: "planter", group: "Plantas", mount: "floor", ...plant, variant: i + 1 });
    solids.push(box);
  }
  return out;
}

/** Centro de cada puerta (para no tapar el paso). */
function doorCenters(walls: DecorWall[], doors: Array<{ wall: number; from: number; to: number }>): Pt[] {
  return doors.map((d) => {
    const w = walls[d.wall]!;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const at = (d.from + d.to) / 2;
    return { x: w.a.x + ((w.b.x - w.a.x) / len) * at, y: w.a.y + ((w.b.y - w.a.y) / len) * at };
  });
}

/** Objetos de ambientación para la sala (ids estables, el usuario los puede quitar o mover). */
export function decorateRoom(input: DecorInput, doors: Array<{ wall: number; from: number; to: number }> = []): FurnitureItem[] {
  const visible = input.items.filter((f) => !f.hiddenBy);
  const ctx = { ...input, items: visible };
  const solids = visible.filter(occupiesFloor).map((f) => footprint(f));
  const art = wallArt(ctx);
  const lamps = floorLamps(ctx, solids);
  const plants = cornerPlants(ctx, solids, doorCenters(input.walls, doors));
  return [...art, ...lamps, ...plants];
}

/** Una silla es de este escritorio si está a esta distancia de su borde (m). */
const OWN_CHAIR_REACH_M = 0.9;

/**
 * Lado (z local, +1 / −1) donde trabaja la persona: el de su silla; sin silla
 * propia (docente, recepción) es el lado de la pared más cercana, mirando a la sala.
 */
export function seatSideOf(table: FurnitureItem, items: FurnitureItem[], floor?: Pt[]): 1 | -1 {
  const chairs = items.filter((f) => f.kind === "chair" || f.kind === "side-chair");
  let best: FurnitureItem | null = null;
  let bestD = Infinity;
  for (const c of chairs) {
    const d = Math.hypot(c.x - table.x, c.z - table.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  const reach = Math.max(table.w ?? 0.6, table.d ?? 0.6) / 2 + OWN_CHAIR_REACH_M;
  if (!best || bestD > reach) return floor ? wallSide(table, floor) : 1;
  // z local de la silla respecto de la mesa.
  const dx = best.x - table.x;
  const dz = best.z - table.z;
  const lz = dx * Math.sin(table.rotY) + dz * Math.cos(table.rotY);
  return lz >= 0 ? 1 : -1;
}
