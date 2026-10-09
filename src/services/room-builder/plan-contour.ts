/**
 * Contorno de un espacio detectado en el plano: de la grilla de etiquetas a
 * un polígono simple que sigue las paredes (forma de L, ochavas…). Se recorre
 * el borde entre celdas, se simplifica y se enderezan los lados casi rectos.
 */

import { MAX_POLYGON_POINTS, cleanPolygon, type PlanPoint } from "./plan-polygon";

/** Tolerancia de simplificación, en celdas de la grilla. */
const SIMPLIFY_CELLS = 1.6;
/** Lados a menos de estos grados de la horizontal/vertical se enderezan. */
const ORTHO_DEG = 12;

/**
 * Borde exterior de las celdas que pertenecen a `members`, en coordenadas de
 * grilla (vértices sobre las líneas de la grilla). Vacío si no hay celdas.
 */
export function traceOuterBoundary(labels: Int32Array, width: number, height: number, members: Set<number>): PlanPoint[] {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && members.has(labels[y * width + x]);
  const W = width + 1;
  const from: number[] = [];
  const to: number[] = [];
  const out = new Map<number, number[]>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const a = ay * W + ax;
    from.push(a);
    to.push(by * W + bx);
    const list = out.get(a);
    if (list) list.push(from.length - 1);
    else out.set(a, [from.length - 1]);
  };
  // Lados orientados con el espacio a la derecha (y hacia abajo).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  if (!from.length) return [];

  const used = new Uint8Array(from.length);
  let best: PlanPoint[] = [];
  let bestArea = 0;
  for (let start = 0; start < from.length; start++) {
    if (used[start]) continue;
    const loop: PlanPoint[] = [];
    let e = start;
    while (e >= 0 && !used[e]) {
      used[e] = 1;
      const v = from[e];
      loop.push({ x: v % W, y: Math.floor(v / W) });
      const nextList = out.get(to[e]) ?? [];
      e = nextList.find((n) => !used[n]) ?? -1;
    }
    const area = Math.abs(shoelace(loop));
    if (area > bestArea) {
      bestArea = area;
      best = loop;
    }
  }
  return best;
}

function shoelace(poly: PlanPoint[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function distToSegment(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function douglasPeucker(pts: PlanPoint[], eps: number): PlanPoint[] {
  if (pts.length <= 2) return pts;
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i]!, pts[0]!, pts[pts.length - 1]!);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [pts[0]!, pts[pts.length - 1]!];
  const left = douglasPeucker(pts.slice(0, idx + 1), eps);
  const right = douglasPeucker(pts.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

/** Simplificación de un polígono cerrado (se parte en el punto más lejano al primero). */
export function simplifyClosed(poly: PlanPoint[], eps: number): PlanPoint[] {
  if (poly.length <= 4) return poly;
  const first = poly[0]!;
  let far = 0;
  let farD = -1;
  poly.forEach((p, i) => {
    const d = Math.hypot(p.x - first.x, p.y - first.y);
    if (d > farD) {
      farD = d;
      far = i;
    }
  });
  const a = douglasPeucker(poly.slice(0, far + 1), eps);
  const b = douglasPeucker([...poly.slice(far), first], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Endereza los lados casi horizontales o verticales (los planos son ortogonales). */
export function orthogonalize(poly: PlanPoint[]): PlanPoint[] {
  const out = poly.map((p) => ({ ...p }));
  const tan = Math.tan((ORTHO_DEG * Math.PI) / 180);
  for (let i = 0; i < out.length; i++) {
    const a = out[i]!;
    const b = out[(i + 1) % out.length]!;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dy <= dx * tan) {
      const y = (a.y + b.y) / 2;
      a.y = y;
      b.y = y;
    } else if (dx <= dy * tan) {
      const x = (a.x + b.x) / 2;
      a.x = x;
      b.x = x;
    }
  }
  return out;
}

/** Dilatación cuadrada (radio k) de una máscara, separable. */
function dilateSquare(mask: Uint8Array, w: number, h: number, k: number): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    // Pasada hacia adelante y hacia atrás: distancia al último 1 en la fila.
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) last = x;
      if (x - last <= k) tmp[y * w + x] = 1;
    }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) {
      if (mask[y * w + x]) last = x;
      if (last - x <= k) tmp[y * w + x] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) last = y;
      if (y - last <= k) out[y * w + x] = 1;
    }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) last = y;
      if (last - y <= k) out[y * w + x] = 1;
    }
  }
  return out;
}

/**
 * Cierre morfológico del espacio: rellena entrantes más angostos que 2k
 * celdas (hojas de puerta, muebles o columnas pegados a la pared) sin tocar
 * las formas grandes (una L sigue siendo L) ni invadir otros espacios.
 * Devuelve una grilla de etiquetas donde el espacio ya está cerrado.
 */
function closeRegion(grid: { labels: Int32Array; width: number; height: number }, members: Set<number>, k: number): Int32Array {
  const { labels, width, height } = grid;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let p = 0; p < labels.length; p++) {
    if (!members.has(labels[p])) continue;
    const x = p % width;
    const y = (p - x) / width;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return labels;
  // Ventana con margen: la erosión no debe "ver" el borde de la ventana como vacío.
  const pad = k + 1;
  const wx0 = x0 - pad;
  const wy0 = y0 - pad;
  const w = x1 - x0 + 1 + 2 * pad;
  const h = y1 - y0 + 1 + 2 * pad;
  const mask = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (members.has(labels[y * width + x])) mask[(y - wy0) * w + (x - wx0)] = 1;
  }
  const grown = dilateSquare(mask, w, h, k);
  const inverse = new Uint8Array(grown.length);
  for (let i = 0; i < grown.length; i++) inverse[i] = grown[i] ? 0 : 1;
  const shrunkInv = dilateSquare(inverse, w, h, k);
  // Apertura chica: saca puntas finas (líneas de cota o de muebles que quedaron pegadas).
  const kOpen = Math.max(1, Math.round(k / 4));
  const thin = dilateSquare(shrunkInv, w, h, kOpen);
  const coreMask = new Uint8Array(thin.length);
  for (let i = 0; i < thin.length; i++) coreMask[i] = thin[i] ? 0 : 1;
  const opened = dilateSquare(coreMask, w, h, kOpen);
  const target = members.values().next().value as number;
  const out = new Int32Array(labels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (shrunkInv[y * w + x]) {
        // Afuera del cierre: si era del espacio, igual se descarta solo si es una punta.
        const gx = x + wx0;
        const gy = y + wy0;
        if (gx >= 0 && gy >= 0 && gx < width && gy < height && members.has(labels[gy * width + gx])) out[gy * width + gx] = -1;
        continue;
      }
      if (!opened[y * w + x]) {
        const gx = x + wx0;
        const gy = y + wy0;
        if (gx >= 0 && gy >= 0 && gx < width && gy < height && members.has(labels[gy * width + gx])) out[gy * width + gx] = -1;
        continue;
      }
      const gx = x + wx0;
      const gy = y + wy0;
      if (gx < 0 || gy < 0 || gx >= width || gy >= height) continue;
      const cur = labels[gy * width + gx];
      // Solo se rellena lo que no es de otro espacio (muros, muebles, huecos).
      if (cur < 0 || members.has(cur)) out[gy * width + gx] = target;
    }
  }
  return out;
}

/**
 * Polígono normalizado (0..1) del espacio formado por `members` en la grilla.
 * null si no se puede armar un contorno razonable.
 */
export function regionPolygon(
  grid: { labels: Int32Array; width: number; height: number },
  members: number[],
  closeCells = 0,
): PlanPoint[] | null {
  const set = new Set(members);
  const labels = closeCells > 0 ? closeRegion(grid, set, closeCells) : grid.labels;
  const raw = traceOuterBoundary(labels, grid.width, grid.height, set);
  if (raw.length < 4) return null;
  let eps = SIMPLIFY_CELLS;
  let poly = cleanPolygon(orthogonalize(simplifyClosed(raw, eps)));
  while (poly.length > MAX_POLYGON_POINTS && eps < 50) {
    eps *= 1.6;
    poly = cleanPolygon(orthogonalize(simplifyClosed(raw, eps)));
  }
  if (poly.length < 3 || poly.length > MAX_POLYGON_POINTS) return null;
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  return poly.map((p) => ({ x: r4(Math.min(1, Math.max(0, p.x / grid.width))), y: r4(Math.min(1, Math.max(0, p.y / grid.height))) }));
}
