/**
 * Objetos dibujados en el plano (muebles, sanitarios, mesadas): se encuentran
 * como trazos dentro de cada ambiente que no son pared, se clasifican (con IA
 * o por tamaño y tipo de ambiente) y se convierten en muebles 3D en su
 * posición y tamaño reales.
 */

import type { FurnitureItem, FurnitureKind } from "./furnishing";
import { pointInPolygon, type PlanPoint } from "./plan-polygon";

/** Tipos que la clasificación puede devolver. */
export const OBJECT_KINDS = [
  "sofa",
  "armchair",
  "bed",
  "dining-set",
  "table",
  "desk",
  "chair",
  "counter",
  "kitchen-counter",
  "wardrobe",
  "shelving",
  "planter",
  "toilet",
  "sink",
  "shower",
  "bathtub",
  "tv",
  "piano",
  "stairs",
  "door",
  "text",
  "other",
] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** Lo que no se arma en 3D (no es un mueble). */
const IGNORED = new Set<ObjectKind>(["door", "text", "stairs", "other"]);

export type Facing = "up" | "down" | "left" | "right";

/** Objeto encontrado en el plano, en coordenadas normalizadas de la imagen (0..1). */
export type PlanObject = {
  box: { x0: number; y0: number; x1: number; y1: number };
  /** Lados del recuadro pegados al borde del ambiente (contra la pared). */
  againstWall: Facing[];
  /** Parte del recuadro con trazo (un contorno es ralo; un bloque es denso). */
  density: number;
};

export type ClassifiedObject = PlanObject & { kind: ObjectKind; facing: Facing };

/** Lado mínimo de un objeto (m) y parte máxima del ambiente que puede ocupar. */
const MIN_SIDE_M = 0.3;
const MAX_ROOM_SHARE = 0.7;
const MAX_OBJECTS = 24;
/** Tolerancia (celdas) al ver si un trazo cae dentro de otro. */
const MERGE_GAP = 1;
/** Parte del objeto más chico que tiene que caer dentro del otro para unirlos. */
const INSIDE_SHARE = 0.6;

/**
 * Objetos dentro de un ambiente. `ink` es la máscara de trazo de la grilla
 * (sin muros: el polígono del ambiente llega hasta la cara interior),
 * `polygon` el contorno del ambiente (normalizado) y `cellM` los metros por
 * celda (para descartar lo muy chico).
 */
export function extractRoomObjects(ink: Uint8Array, width: number, height: number, polygon: PlanPoint[], cellM: number): PlanObject[] {
  let bx0 = 1;
  let by0 = 1;
  let bx1 = 0;
  let by1 = 0;
  for (const p of polygon) {
    bx0 = Math.min(bx0, p.x);
    by0 = Math.min(by0, p.y);
    bx1 = Math.max(bx1, p.x);
    by1 = Math.max(by1, p.y);
  }
  const gx0 = Math.max(0, Math.floor(bx0 * width));
  const gy0 = Math.max(0, Math.floor(by0 * height));
  const gx1 = Math.min(width - 1, Math.ceil(bx1 * width));
  const gy1 = Math.min(height - 1, Math.ceil(by1 * height));
  const W = gx1 - gx0 + 1;
  const H = gy1 - gy0 + 1;
  if (W <= 2 || H <= 2) return [];
  // Adentro del ambiente (centro de cada celda).
  const inside = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      inside[y * W + x] = pointInPolygon({ x: (gx0 + x + 0.5) / width, y: (gy0 + y + 0.5) / height }, polygon) ? 1 : 0;
    }
  }
  const at = (x: number, y: number) => inside[y * W + x] === 1 && ink[(gy0 + y) * width + gx0 + x] === 1;
  const seen = new Uint8Array(W * H);
  type Comp = { x0: number; y0: number; x1: number; y1: number; n: number };
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let s = 0; s < W * H; s++) {
    const sx = s % W;
    const sy = (s - sx) / W;
    if (seen[s] || !at(sx, sy)) continue;
    const c: Comp = { x0: sx, y0: sy, x1: sx, y1: sy, n: 0 };
    seen[s] = 1;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop() as number;
      const x = p % W;
      const y = (p - x) / W;
      c.n++;
      c.x0 = Math.min(c.x0, x);
      c.y0 = Math.min(c.y0, y);
      c.x1 = Math.max(c.x1, x);
      c.y1 = Math.max(c.y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const q = yy * W + xx;
          if (!seen[q] && at(xx, yy)) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    comps.push(c);
  }
  // Trazos cercanos son el mismo objeto (almohadones de un sillón, sillas de una mesa).
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < comps.length && !merged; i++) {
      for (let j = i + 1; j < comps.length && !merged; j++) {
        const a = comps[i]!;
        const b = comps[j]!;
        // Mismo objeto si uno queda casi entero dentro del otro (almohadones en un sillón, bacha en
        // una mesada); dos muebles uno al lado del otro siguen separados.
        const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1 + MERGE_GAP);
        const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1 + MERGE_GAP);
        const smaller = Math.min((a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1), (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1));
        if (ix * iy >= INSIDE_SHARE * smaller) {
          comps[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), n: a.n + b.n };
          comps.splice(j, 1);
          merged = true;
        }
      }
    }
  }
  const minCells = MIN_SIDE_M / Math.max(1e-6, cellM);
  // Borde del ambiente: a qué lado del recuadro hay pared cerca.
  const nearEdge = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || inside[y * W + x] === 0;
  const touches = (c: Comp): Facing[] => {
    const out: Facing[] = [];
    const probe = 3;
    const midX = Math.round((c.x0 + c.x1) / 2);
    const midY = Math.round((c.y0 + c.y1) / 2);
    if (nearEdge(midX, c.y0 - probe)) out.push("up");
    if (nearEdge(midX, c.y1 + probe)) out.push("down");
    if (nearEdge(c.x0 - probe, midY)) out.push("left");
    if (nearEdge(c.x1 + probe, midY)) out.push("right");
    return out;
  };
  return comps
    .filter((c) => {
      const w = c.x1 - c.x0 + 1;
      const h = c.y1 - c.y0 + 1;
      return Math.max(w, h) >= minCells && w <= W * MAX_ROOM_SHARE + 1 && h <= H * MAX_ROOM_SHARE + 1;
    })
    .sort((a, b) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) - (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1))
    .slice(0, MAX_OBJECTS)
    .map((c) => ({
      box: { x0: (gx0 + c.x0) / width, y0: (gy0 + c.y0) / height, x1: (gx0 + c.x1 + 1) / width, y1: (gy0 + c.y1 + 1) / height },
      againstWall: touches(c),
      density: c.n / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)),
    }));
}

/** Hacia dónde mira: lejos de la pared que toca (un sillón contra la pared mira al ambiente). */
export function facingAwayFromWall(against: Facing[]): Facing {
  const opposite: Record<Facing, Facing> = { up: "down", down: "up", left: "right", right: "left" };
  return against.length ? opposite[against[0]!] : "down";
}

/**
 * Clasificación sin IA, por medidas (m) y tipo de ambiente. Es aproximada:
 * la IA la reemplaza cuando está disponible.
 */
export function guessKind(widthM: number, depthM: number, category: string, templateKey: string): ObjectKind {
  const long = Math.max(widthM, depthM);
  const short = Math.min(widthM, depthM);
  const bath = /restroom|bath/.test(templateKey);
  const bedroom = /bedroom|hotel-guest|suite/.test(templateKey);
  const kitchen = /dining|kitchen|breakroom/.test(templateKey);
  if (bath) {
    if (long >= 1.4 && short >= 0.6) return "bathtub";
    if (long >= 0.8 && short >= 0.75) return "shower";
    if (long <= 0.8 && short <= 0.55) return short < 0.45 ? "toilet" : "sink";
    return "sink";
  }
  if (long < 0.5) return "planter";
  if (long < 0.75) return "armchair";
  if (bedroom && short >= 1.3 && long >= 1.8 && long <= 2.4) return "bed";
  if (kitchen && short <= 0.75 && long >= 1.2) return "kitchen-counter";
  // Mostrador: angosto y largo en locales; sillón: 0,7–1,1 m de profundidad.
  if (short <= 0.65 && long >= 1.4 && (category === "commercial" || category === "lobby")) return "counter";
  if (short <= 1.1 && long >= 1.4) return "sofa";
  if (short >= 0.75 && long <= 2.6) return kitchen || category === "residential" ? "dining-set" : "table";
  return "other";
}

const FACING_ROT: Record<Facing, number> = { down: 0, up: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 };

/** Equivalencia con los muebles 3D, nombre del grupo en la lista y alto. */
const TO_FURNITURE: Record<Exclude<ObjectKind, "door" | "text" | "stairs" | "other">, { kind: FurnitureKind; group: string; h?: number }> = {
  sofa: { kind: "sofa", group: "Sillones" },
  armchair: { kind: "lounge-chair", group: "Sillones" },
  bed: { kind: "bed", group: "Camas" },
  "dining-set": { kind: "conference-table", group: "Mesas" },
  table: { kind: "conference-table", group: "Mesas" },
  desk: { kind: "desk", group: "Escritorios" },
  chair: { kind: "side-chair", group: "Sillas" },
  counter: { kind: "reception-desk", group: "Mostradores" },
  "kitchen-counter": { kind: "kitchen-counter", group: "Mesadas" },
  wardrobe: { kind: "wardrobe", group: "Placards" },
  shelving: { kind: "shelving", group: "Estanterías" },
  planter: { kind: "planter", group: "Plantas" },
  toilet: { kind: "toilet", group: "Sanitarios" },
  sink: { kind: "vanity", group: "Sanitarios" },
  shower: { kind: "shower", group: "Sanitarios" },
  bathtub: { kind: "bathtub", group: "Sanitarios" },
  tv: { kind: "media-console", group: "Muebles de TV" },
  piano: { kind: "credenza", group: "Otros" },
};

/** Cómo calza el plano en la sala (mismo dato que el plano del piso). */
export type RoomMapping = { centerPx: { x: number; y: number }; mppX: number; mppZ: number; widthPx: number; heightPx: number };

/** Objetos clasificados → muebles 3D en su lugar y tamaño. */
export function objectsToFurniture(objects: ClassifiedObject[], map: RoomMapping): FurnitureItem[] {
  const items: FurnitureItem[] = [];
  objects.forEach((o, i) => {
    if (IGNORED.has(o.kind)) return;
    const spec = TO_FURNITURE[o.kind as keyof typeof TO_FURNITURE];
    if (!spec) return;
    const cxPx = ((o.box.x0 + o.box.x1) / 2) * map.widthPx;
    const cyPx = ((o.box.y0 + o.box.y1) / 2) * map.heightPx;
    const worldW = (o.box.x1 - o.box.x0) * map.widthPx * map.mppX;
    const worldD = (o.box.y1 - o.box.y0) * map.heightPx * map.mppZ;
    // El mueble se dibuja con su ancho en x local: si mira de costado, el ancho es la profundidad del plano.
    const sideways = o.facing === "left" || o.facing === "right";
    const w = Math.round((sideways ? worldD : worldW) * 100) / 100;
    const d = Math.round((sideways ? worldW : worldD) * 100) / 100;
    const x = Math.round((cxPx - map.centerPx.x) * map.mppX * 100) / 100;
    const z = Math.round((cyPx - map.centerPx.y) * map.mppZ * 100) / 100;
    const base: FurnitureItem = { id: `plan-obj-${i}`, kind: spec.kind, group: spec.group, x, z, rotY: FACING_ROT[o.facing], mount: "floor", w, d, ...(spec.h ? { h: spec.h } : {}) };
    if (o.kind === "planter") base.scale = Math.max(0.6, Math.min(1.6, Math.max(w, d) / 0.5));
    if (o.kind === "table" || o.kind === "dining-set") {
      const round = Math.abs(w - d) < 0.15 * Math.max(w, d);
      // En un juego de comedor el recuadro dibujado incluye las sillas: la mesa es más chica.
      const shrink = o.kind === "dining-set" ? 1 : 0;
      const table: FurnitureItem = { ...base, w: Math.round(Math.max(0.7, w - shrink) * 100) / 100, d: Math.round(Math.max(0.7, d - shrink) * 100) / 100 };
      items.push(round ? { ...table, kind: "round-table", w: Math.min(table.w ?? 1, table.d ?? 1) } : table);
      if (o.kind === "dining-set") items.push(...chairsAround(table, round));
      return;
    }
    items.push(base);
  });
  return items;
}

/** Sillas alrededor de una mesa (el plano suele dibujar mesa y sillas juntas). */
function chairsAround(table: FurnitureItem, round: boolean): FurnitureItem[] {
  const tw = table.w ?? 1.2;
  const td = table.d ?? 0.8;
  const out: FurnitureItem[] = [];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (round) {
    const seats = 4;
    for (let k = 0; k < seats; k++) {
      const a = (k / seats) * Math.PI * 2;
      out.push({ id: `${table.id}-c${k}`, kind: "side-chair", group: "Sillas", x: r2(table.x + Math.sin(a) * (tw / 2 + 0.35)), z: r2(table.z + Math.cos(a) * (tw / 2 + 0.35)), rotY: a + Math.PI, mount: "floor" });
    }
    return out;
  }
  const per = Math.max(1, Math.round(tw / 0.6));
  const c = Math.cos(table.rotY);
  const s = Math.sin(table.rotY);
  for (let k = 0; k < per; k++) {
    const lx = -tw / 2 + (tw / per) * (k + 0.5);
    for (const side of [-1, 1]) {
      const lz = side * (td / 2 + 0.35);
      out.push({
        id: `${table.id}-c${k}${side > 0 ? "a" : "b"}`,
        kind: "side-chair",
        group: "Sillas",
        x: r2(table.x + lx * c + lz * s),
        z: r2(table.z - lx * s + lz * c),
        rotY: table.rotY + (side > 0 ? Math.PI : 0),
        mount: "floor",
      });
    }
  }
  return out;
}
