/**
 * Geometría de los ambientes dibujados sobre el plano. Todo en coordenadas
 * normalizadas (0..1 del ancho y alto de la imagen): un ambiente puede ser un
 * recuadro o un polígono trazado con el lápiz (forma de L, ochava, etc.).
 */

import type { PlanBox } from "./plan-analysis";

export type PlanPoint = { x: number; y: number };

/** Mínimo de vértices para un ambiente y máximo para no cargar de más. */
export const MIN_POLYGON_POINTS = 3;
export const MAX_POLYGON_POINTS = 64;
/** Ángulo (grados) dentro del cual una línea se endereza a horizontal/vertical. */
const ORTHO_SNAP_DEG = 7;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function clampPoint(p: PlanPoint): PlanPoint {
  return { x: round4(clamp01(p.x)), y: round4(clamp01(p.y)) };
}

export function boxToPolygon(b: PlanBox): PlanPoint[] {
  return [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y0 },
    { x: b.x1, y: b.y1 },
    { x: b.x0, y: b.y1 },
  ];
}

export function polygonBox(poly: PlanPoint[]): PlanBox {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Área en píxeles² de la imagen (fórmula del lazo). */
export function polygonAreaPx(poly: PlanPoint[], widthPx: number, heightPx: number): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a.x * widthPx * (b.y * heightPx) - b.x * widthPx * (a.y * heightPx);
  }
  return Math.abs(sum) / 2;
}

/** Punto donde ubicar la etiqueta: el centroide si cae adentro, si no el vértice más céntrico. */
export function polygonLabelPoint(poly: PlanPoint[]): PlanPoint {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) > 1e-9) {
    const c = { x: cx / (3 * a), y: cy / (3 * a) };
    if (pointInPolygon(c, poly)) return c;
  }
  const b = polygonBox(poly);
  const mid = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  if (pointInPolygon(mid, poly)) return mid;
  return poly.reduce((best, p) => (Math.hypot(p.x - mid.x, p.y - mid.y) < Math.hypot(best.x - mid.x, best.y - mid.y) ? p : best), poly[0]!);
}

export function pointInPolygon(p: PlanPoint, poly: PlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Mueve todo el polígono sin que se salga de la imagen. */
export function translatePolygon(poly: PlanPoint[], dx: number, dy: number): PlanPoint[] {
  const b = polygonBox(poly);
  const sx = Math.min(1 - b.x1, Math.max(-b.x0, dx));
  const sy = Math.min(1 - b.y1, Math.max(-b.y0, dy));
  return poly.map((p) => clampPoint({ x: p.x + sx, y: p.y + sy }));
}

export function moveVertex(poly: PlanPoint[], index: number, to: PlanPoint): PlanPoint[] {
  return poly.map((p, i) => (i === index ? clampPoint(to) : p));
}

/** Agrega un vértice en el medio del lado `edgeIndex` (entre el vértice i y el i+1). */
export function insertVertex(poly: PlanPoint[], edgeIndex: number, at?: PlanPoint): PlanPoint[] {
  if (poly.length >= MAX_POLYGON_POINTS) return poly;
  const a = poly[edgeIndex]!;
  const b = poly[(edgeIndex + 1) % poly.length]!;
  const p = clampPoint(at ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return [...poly.slice(0, edgeIndex + 1), p, ...poly.slice(edgeIndex + 1)];
}

export function removeVertex(poly: PlanPoint[], index: number): PlanPoint[] {
  if (poly.length <= MIN_POLYGON_POINTS) return poly;
  return poly.filter((_, i) => i !== index);
}

/**
 * Endereza la línea que va de `from` a `to` si está casi horizontal o
 * vertical (los planos son casi siempre ortogonales). Trabaja en píxeles
 * para que el ángulo sea el real y no el deformado por la proporción.
 */
export function snapOrtho(from: PlanPoint, to: PlanPoint, widthPx: number, heightPx: number): PlanPoint {
  const dx = (to.x - from.x) * widthPx;
  const dy = (to.y - from.y) * heightPx;
  if (!dx && !dy) return to;
  const deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  if (deg <= ORTHO_SNAP_DEG) return { x: to.x, y: from.y };
  if (deg >= 90 - ORTHO_SNAP_DEG) return { x: from.x, y: to.y };
  return to;
}

/**
 * Imán a vértices existentes (de otros ambientes o del mismo trazo), para que
 * dos ambientes vecinos compartan la pared sin huecos. `radiusPx` en píxeles de imagen.
 */
export function snapToVertices(p: PlanPoint, vertices: PlanPoint[], widthPx: number, heightPx: number, radiusPx: number): PlanPoint {
  let best: PlanPoint | null = null;
  let bestD = radiusPx;
  for (const v of vertices) {
    const d = Math.hypot((v.x - p.x) * widthPx, (v.y - p.y) * heightPx);
    if (d <= bestD) {
      best = v;
      bestD = d;
    }
  }
  return best ? { ...best } : p;
}

/** Saca puntos repetidos y los que quedan alineados en medio de una recta. */
export function cleanPolygon(poly: PlanPoint[]): PlanPoint[] {
  const EPS = 1e-4;
  const dedup = poly.filter((p, i) => {
    const prev = poly[(i - 1 + poly.length) % poly.length]!;
    return poly.length === 1 || Math.hypot(p.x - prev.x, p.y - prev.y) > EPS;
  });
  if (dedup.length <= MIN_POLYGON_POINTS) return dedup;
  return dedup.filter((p, i) => {
    const a = dedup[(i - 1 + dedup.length) % dedup.length]!;
    const b = dedup[(i + 1) % dedup.length]!;
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return Math.abs(cross) / len > EPS;
  });
}

/** ¿El polígono es un recuadro alineado a los ejes? (entonces se edita como recuadro). */
export function isAxisRect(poly: PlanPoint[]): boolean {
  if (poly.length !== 4) return false;
  const b = polygonBox(poly);
  return poly.every((p) => (p.x === b.x0 || p.x === b.x1) && (p.y === b.y0 || p.y === b.y1));
}

/** Valida y normaliza un polígono que llega de afuera (API). null si no sirve. */
export function normalizePolygon(raw: unknown): PlanPoint[] | null {
  if (!Array.isArray(raw)) return null;
  const pts: PlanPoint[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") return null;
    const { x, y } = it as Record<string, unknown>;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    pts.push(clampPoint({ x, y }));
  }
  const clean = cleanPolygon(pts);
  return clean.length >= MIN_POLYGON_POINTS && clean.length <= MAX_POLYGON_POINTS ? clean : null;
}

/**
 * Polígono del plano → piso del ambiente en metros, con el centro de su caja
 * contenedora en el origen (como la sala 3D). X a la derecha y la parte de
 * arriba del plano hacia el fondo (-Z), igual que se ve desde arriba.
 */
export function polygonToRoomMeters(poly: PlanPoint[], widthM: number, depthM: number): PlanPoint[] {
  const b = polygonBox(poly);
  const bw = b.x1 - b.x0 || 1;
  const bh = b.y1 - b.y0 || 1;
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return poly.map((p) => ({ x: r2(((p.x - cx) / bw) * widthM), y: r2(((p.y - cy) / bh) * depthM) }));
}
