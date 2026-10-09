/**
 * Ajuste de los recuadros de la IA a las paredes reales del plano.
 *
 * La IA lee bien qué es cada ambiente pero ubica los rectángulos de forma
 * aproximada. Acá, sobre la imagen en escala de grises, cada borde busca la
 * línea de muro más marcada cerca de donde lo puso la IA y se pega a su cara
 * interior. Funciona con huecos de puertas: se mide la densidad de muro a lo
 * largo del borde, no una línea continua.
 */

import type { PlanBox } from "./plan-analysis";

export type GrayImage = { data: Uint8Array; width: number; height: number };

/** Píxel "de muro": más oscuro que esto. */
const DARK = 110;
/** Fracción del borde que tiene que ser muro para considerarlo una pared. */
const WALL_DENSITY = 0.45;
/** Se ignoran las puntas del borde (ahí cruzan las paredes perpendiculares). */
const EDGE_TRIM = 0.15;
/** Cuánto se puede mover un borde: fracción de la imagen y del propio recuadro. */
const SEARCH_IMAGE = 0.08;
const SEARCH_BOX = 0.35;
const PASSES = 2;

function rowDensity(img: GrayImage, y: number, x0: number, x1: number): number {
  if (y < 0 || y >= img.height || x1 <= x0) return 0;
  let dark = 0;
  const base = y * img.width;
  for (let x = x0; x < x1; x++) if (img.data[base + x] < DARK) dark++;
  return dark / (x1 - x0);
}

function colDensity(img: GrayImage, x: number, y0: number, y1: number): number {
  if (x < 0 || x >= img.width || y1 <= y0) return 0;
  let dark = 0;
  for (let y = y0; y < y1; y++) if (img.data[y * img.width + x] < DARK) dark++;
  return dark / (y1 - y0);
}

/**
 * Busca la pared cerca de `pos` (en un eje) y devuelve la cara interior:
 * `inward` = +1 si el interior del ambiente está hacia valores mayores.
 */
function snapEdge(pos: number, inward: 1 | -1, limit: number, window: number, density: (p: number) => number): number {
  let best = -1;
  let bestScore = WALL_DENSITY;
  const from = Math.max(0, Math.round(pos - window));
  const to = Math.min(limit - 1, Math.round(pos + window));
  for (let p = from; p <= to; p++) {
    const s = density(p);
    if (s > bestScore || (s === bestScore && best >= 0 && Math.abs(p - pos) < Math.abs(best - pos))) {
      best = p;
      bestScore = s;
    }
  }
  if (best < 0) return pos;
  // Recorre el espesor del muro hacia adentro hasta salir de él.
  let p = best;
  while (p + inward >= 0 && p + inward < limit && density(p + inward) >= WALL_DENSITY) p += inward;
  return p + inward;
}

/** Ajusta un recuadro (normalizado) a los muros de la imagen. */
export function snapBoxToWalls(box: PlanBox, img: GrayImage): PlanBox {
  let x0 = box.x0 * img.width;
  let x1 = box.x1 * img.width;
  let y0 = box.y0 * img.height;
  let y1 = box.y1 * img.height;
  for (let pass = 0; pass < PASSES; pass++) {
    const w = x1 - x0;
    const h = y1 - y0;
    const xa = Math.round(x0 + w * EDGE_TRIM);
    const xb = Math.round(x1 - w * EDGE_TRIM);
    const ya = Math.round(y0 + h * EDGE_TRIM);
    const yb = Math.round(y1 - h * EDGE_TRIM);
    const winY = Math.min(img.height * SEARCH_IMAGE, h * SEARCH_BOX) + 2;
    const winX = Math.min(img.width * SEARCH_IMAGE, w * SEARCH_BOX) + 2;
    const ny0 = snapEdge(y0, 1, img.height, winY, (y) => rowDensity(img, y, xa, xb));
    const ny1 = snapEdge(y1, -1, img.height, winY, (y) => rowDensity(img, y, xa, xb));
    const nx0 = snapEdge(x0, 1, img.width, winX, (x) => colDensity(img, x, ya, yb));
    const nx1 = snapEdge(x1, -1, img.width, winX, (x) => colDensity(img, x, ya, yb));
    // Solo se acepta si el recuadro sigue siendo razonable.
    if (ny1 - ny0 > h * 0.4 && nx1 - nx0 > w * 0.4) {
      [x0, x1, y0, y1] = [nx0, nx1, ny0, ny1];
    }
  }
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  return { x0: clamp01(x0 / img.width), y0: clamp01(y0 / img.height), x1: clamp01((x1 + 1) / img.width), y1: clamp01((y1 + 1) / img.height) };
}
