/**
 * Formas de los muebles dibujados: el contorno real (L, trapecio, redondo)
 * a partir de los trazos, y utilidades para construir el 3D sobre esa forma
 * (achicar un polígono lado por lado, encontrar el respaldo de un sillón).
 */

import { cleanPolygon, pointInPolygon, type PlanPoint } from "./plan-polygon";
import { orthogonalize, simplifyClosed, traceOuterBoundary } from "./plan-contour";

/** Tolerancia de simplificación del contorno (celdas). */
const SHAPE_SIMPLIFY = 1.2;

/**
 * Contorno relleno de un objeto: el trazo dentro del recuadro más todo lo que
 * queda encerrado por él (el interior de un sillón dibujado como contorno).
 * Devuelve el polígono normalizado (0..1 de la imagen) o null.
 */
export function footprintPolygon(
  box: { x0: number; y0: number; x1: number; y1: number },
  ink: Uint8Array,
  width: number,
  height: number,
): PlanPoint[] | null {
  const gx0 = Math.max(0, Math.floor(box.x0 * width) - 1);
  const gy0 = Math.max(0, Math.floor(box.y0 * height) - 1);
  const gx1 = Math.min(width - 1, Math.ceil(box.x1 * width));
  const gy1 = Math.min(height - 1, Math.ceil(box.y1 * height));
  const W = gx1 - gx0 + 1;
  const H = gy1 - gy0 + 1;
  if (W < 3 || H < 3) return null;
  const inkAt = (x: number, y: number) => ink[(gy0 + y) * width + gx0 + x] === 1;
  // Afuera = blanco alcanzable desde el borde del recuadro.
  const outside = new Uint8Array(W * H);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const i = y * W + x;
    if (!outside[i] && !inkAt(x, y)) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < W; x++) {
    seed(x, 0);
    seed(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    seed(0, y);
    seed(W - 1, y);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % W;
    const y = (i - x) / W;
    if (x > 0) seed(x - 1, y);
    if (x < W - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < H - 1) seed(x, y + 1);
  }
  const labels = new Int32Array(W * H);
  let n = 0;
  for (let i = 0; i < labels.length; i++) {
    labels[i] = outside[i] ? -1 : 1;
    if (labels[i] === 1) n++;
  }
  if (n < 6) return null;
  const raw = traceOuterBoundary(labels, W, H, new Set([1]));
  if (raw.length < 4) return null;
  const poly = cleanPolygon(orthogonalize(simplifyClosed(raw, SHAPE_SIMPLIFY)));
  if (poly.length < 3) return null;
  return poly.map((p) => ({ x: (gx0 + p.x) / width, y: (gy0 + p.y) / height }));
}

/** ¿Es (casi) un círculo? Muchos lados y proporciones parejas: mesa redonda, maceta. */
export function isRoundish(poly: PlanPoint[]): boolean {
  if (poly.length < 7) return false;
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return w > 0 && h > 0 && Math.abs(w - h) / Math.max(w, h) < 0.2;
}

/** ¿Recuadro (4 lados a escuadra)? */
export function isRectangle(poly: PlanPoint[]): boolean {
  if (poly.length !== 4) return false;
  return poly.every((p, i) => {
    const q = poly[(i + 1) % 4]!;
    return Math.abs(p.x - q.x) < 1e-6 || Math.abs(p.y - q.y) < 1e-6;
  });
}

/**
 * Achica un polígono moviendo cada lado hacia adentro su propia distancia
 * (`inset[i]` para el lado i → i+1). Para armar el asiento de un sillón sin
 * el respaldo ni los apoyabrazos, o la tapa de una mesada con vuelo (negativo).
 */
export function insetPolygon(poly: PlanPoint[], inset: number[]): PlanPoint[] {
  const n = poly.length;
  if (n < 3) return poly;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    // Normal hacia adentro.
    if (!pointInPolygon({ x: (p.x + q.x) / 2 + nx * 1e-3, y: (p.y + q.y) / 2 + ny * 1e-3 }, poly)) {
      nx = -nx;
      ny = -ny;
    }
    const d = inset[i] ?? 0;
    return { px: p.x + nx * d, py: p.y + ny * d, dx: dx / len, dy: dy / len };
  });
  return poly.map((_, j) => {
    const a = lines[(j - 1 + n) % n]!;
    const b = lines[j]!;
    const det = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(det) < 1e-9) return { x: b.px, y: b.py };
    const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / det;
    return { x: a.px + a.dx * t, y: a.py + a.dy * t };
  });
}

/**
 * Lados del respaldo de un sillón dibujado: los lados largos del contorno que
 * están sobre su recuadro exterior. En una L son los dos que forman la esquina
 * de afuera; en un sillón recto, el lado largo opuesto al frente (`front` en
 * coordenadas del polígono: hacia dónde mira el asiento).
 */
export function sofaBackEdges(poly: PlanPoint[], front: { x: number; y: number }): number[] {
  const n = poly.length;
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  const eps = Math.max(w, h) * 0.02;
  const outer: Array<{ i: number; len: number; side: "minX" | "maxX" | "minY" | "maxY" }> = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (Math.abs(p.y - q.y) < eps && Math.abs(p.y - minY) < eps) outer.push({ i, len, side: "minY" });
    else if (Math.abs(p.y - q.y) < eps && Math.abs(p.y - maxY) < eps) outer.push({ i, len, side: "maxY" });
    else if (Math.abs(p.x - q.x) < eps && Math.abs(p.x - minX) < eps) outer.push({ i, len, side: "minX" });
    else if (Math.abs(p.x - q.x) < eps && Math.abs(p.x - maxX) < eps) outer.push({ i, len, side: "maxX" });
  }
  const sideLen = (s: string) => (s === "minY" || s === "maxY" ? w : h);
  // Lados exteriores que ocupan casi todo su lado del recuadro.
  const full = outer.filter((o) => o.len >= sideLen(o.side) * 0.85);
  if (n > 4 && full.length >= 2) {
    // L: los dos lados completos que se tocan (esquina de afuera).
    const adjacent = full.filter((o) => full.some((k) => k !== o && (Math.abs(k.i - o.i) === 1 || Math.abs(k.i - o.i) === n - 1)));
    if (adjacent.length >= 2) return adjacent.slice(0, 2).map((o) => o.i);
  }
  // Recto: el lado largo del lado opuesto al frente.
  const backSide = Math.abs(front.x) > Math.abs(front.y) ? (front.x > 0 ? "minX" : "maxX") : front.y > 0 ? "minY" : "maxY";
  const back = outer.filter((o) => o.side === backSide).sort((a, b) => b.len - a.len)[0];
  return back ? [back.i] : [];
}

/** Normal (unitaria) del lado i que apunta hacia adentro del polígono. */
export function inwardNormal(poly: PlanPoint[], i: number): { x: number; y: number } {
  const p = poly[i]!;
  const q = poly[(i + 1) % poly.length]!;
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
  const probe = { x: (p.x + q.x) / 2 + n.x * 1e-3, y: (p.y + q.y) / 2 + n.y * 1e-3 };
  return pointInPolygon(probe, poly) ? n : { x: -n.x, y: -n.y };
}

/** Largo máximo (m) de un lado para que lleve apoyabrazos (los extremos del sillón, no un lado largo). */
const ARM_MAX_EDGE = 1.3;

/** Lados con apoyabrazos: los extremos que tocan al respaldo y no son respaldo. */
export function armEdges(poly: PlanPoint[], back: number[]): number[] {
  const n = poly.length;
  if (!back.length) return [];
  const out = new Set<number>();
  for (const b of back) {
    for (const j of [(b - 1 + n) % n, (b + 1) % n]) {
      if (back.includes(j)) continue;
      const p = poly[j]!;
      const q = poly[(j + 1) % n]!;
      if (Math.hypot(q.x - p.x, q.y - p.y) <= ARM_MAX_EDGE) out.add(j);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Ancho mínimo (m) de una franja para que lleve almohadón propio. */
const CELL_MIN = 0.15;

/**
 * Almohadones de un asiento a escuadra: parte el polígono en rectángulos
 * (la esquina de una L queda como almohadón propio) y corta los largos en
 * piezas de ~`piece` m. Null si el asiento no es a escuadra (trapecio).
 */
export function seatCushions(poly: PlanPoint[], piece = 0.75): Rect[] | null {
  const n = poly.length;
  const ortho = poly.every((p, i) => {
    const q = poly[(i + 1) % n]!;
    return Math.abs(p.x - q.x) < 1e-6 || Math.abs(p.y - q.y) < 1e-6;
  });
  if (!ortho || n < 4) return null;
  const xs = [...new Set(poly.map((p) => Math.round(p.x * 1000) / 1000))].sort((a, b) => a - b);
  const ys = [...new Set(poly.map((p) => Math.round(p.y * 1000) / 1000))].sort((a, b) => a - b);
  const cells: Rect[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const c = { x0: xs[i]!, x1: xs[i + 1]!, y0: ys[j]!, y1: ys[j + 1]! };
      if (c.x1 - c.x0 < CELL_MIN || c.y1 - c.y0 < CELL_MIN) continue;
      if (pointInPolygon({ x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 }, poly)) cells.push(c);
    }
  }
  return cells.flatMap((c) => {
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    const along = w >= h ? w : h;
    const k = Math.max(1, Math.round(along / piece));
    return Array.from({ length: k }, (_, t) =>
      w >= h ? { ...c, x0: c.x0 + (w * t) / k, x1: c.x0 + (w * (t + 1)) / k } : { ...c, y0: c.y0 + (h * t) / k, y1: c.y0 + (h * (t + 1)) / k },
    );
  });
}

/**
 * Contorno de varios rectángulos que se tocan (piezas de un sillón modular):
 * se agrandan `gap`/2 para soldar las juntas, se unen y se vuelven a achicar.
 */
export function unionRects(rects: Rect[], gap: number): PlanPoint[] {
  const g = gap / 2;
  const grown = rects.map((r) => ({ x0: r.x0 - g, y0: r.y0 - g, x1: r.x1 + g, y1: r.y1 + g }));
  const xs = [...new Set(grown.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const ys = [...new Set(grown.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b);
  const W = xs.length - 1;
  const H = ys.length - 1;
  const labels = new Int32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      labels[j * W + i] = grown.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1) ? 1 : 0;
    }
  }
  const outline = cleanPolygon(traceOuterBoundary(labels, W, H, new Set([1])).map((p) => ({ x: xs[p.x]!, y: ys[p.y]! })));
  return cleanPolygon(insetPolygon(outline, outline.map(() => g)));
}
