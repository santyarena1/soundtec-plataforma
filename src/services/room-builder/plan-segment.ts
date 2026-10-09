/**
 * Segmentación del plano en espacios cerrados (como hacen los programas de
 * arquitectura): se detectan los muros, se cierran huecos chicos (líneas
 * punteadas, trazos cortados) y cada superficie encerrada es un ambiente.
 * Después se le asigna a cada ambiente leído por la IA el espacio que más
 * se superpone con su recuadro, sin repetir.
 */

import type { PlanBox } from "./plan-analysis";
import { snapBoxToWalls, type GrayImage } from "./plan-snap";

export type PlanRegion = { box: PlanBox; areaFrac: number; label: number };
type Grid = { labels: Int32Array; width: number; height: number };

/** Píxel "de muro": más oscuro que esto. */
const DARK = 110;
/** Lado máximo de la grilla de trabajo (velocidad vs. detalle). */
const SEG_MAX_SIDE = 700;
/** Radio de cierre de huecos chicos, en fracción del lado mayor. */
const CLOSE_RADIUS = 0.006;
/** Espacios más chicos que esto son letras o ruido. */
const MIN_REGION_FRAC = 0.004;
/** Mínima superposición para asignar un espacio a un ambiente de la IA. */
const MIN_MATCH = 0.12;
/** Espacios sin nombre que vale la pena ofrecer (no placards ni ductos). */
const MIN_EXTRA_FRAC = 0.012;

function downsampleWalls(img: GrayImage): { wall: Uint8Array; width: number; height: number } {
  const scale = Math.max(1, Math.max(img.width, img.height) / SEG_MAX_SIDE);
  const width = Math.max(1, Math.round(img.width / scale));
  const height = Math.max(1, Math.round(img.height / scale));
  const wall = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy0 = Math.floor(y * scale);
    const sy1 = Math.min(img.height, Math.ceil((y + 1) * scale));
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor(x * scale);
      const sx1 = Math.min(img.width, Math.ceil((x + 1) * scale));
      // Es muro si alguno de los píxeles que representa es oscuro.
      let dark = 0;
      for (let sy = sy0; sy < sy1 && !dark; sy++) {
        const base = sy * img.width;
        for (let sx = sx0; sx < sx1; sx++) {
          if (img.data[base + sx] < DARK) {
            dark = 1;
            break;
          }
        }
      }
      wall[y * width + x] = dark;
    }
  }
  return { wall, width, height };
}

/** Engrosa los muros r píxeles (cierra huecos chicos). Separable: horizontal y vertical. */
function dilate(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  const horizontal = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let xx = Math.max(0, x - r); xx <= Math.min(width - 1, x + r); xx++) horizontal[y * width + xx] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!horizontal[y * width + x]) continue;
      for (let yy = Math.max(0, y - r); yy <= Math.min(height - 1, y + r); yy++) out[yy * width + x] = 1;
    }
  }
  return out;
}

/** Espacios cerrados (que no tocan el borde de la imagen) con su recuadro. */
export function segmentRegions(img: GrayImage): { regions: PlanRegion[]; grid: Grid } {
  const { wall, width, height } = downsampleWalls(img);
  const r = Math.max(1, Math.round(CLOSE_RADIUS * Math.max(width, height)));
  const closed = dilate(wall, width, height, r);
  const labels = new Int32Array(width * height).fill(-1);
  const regions: PlanRegion[] = [];
  const stack: number[] = [];
  let next = 0;
  for (let start = 0; start < labels.length; start++) {
    if (closed[start] || labels[start] !== -1) continue;
    const label = next++;
    let count = 0;
    let touchesBorder = false;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    labels[start] = label;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop() as number;
      const x = p % width;
      const y = (p - x) / width;
      count++;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && !closed[p - 1] && labels[p - 1] === -1) {
        labels[p - 1] = label;
        stack.push(p - 1);
      }
      if (x < width - 1 && !closed[p + 1] && labels[p + 1] === -1) {
        labels[p + 1] = label;
        stack.push(p + 1);
      }
      if (y > 0 && !closed[p - width] && labels[p - width] === -1) {
        labels[p - width] = label;
        stack.push(p - width);
      }
      if (y < height - 1 && !closed[p + width] && labels[p + width] === -1) {
        labels[p + width] = label;
        stack.push(p + width);
      }
    }
    const areaFrac = count / (width * height);
    if (touchesBorder || areaFrac < MIN_REGION_FRAC) continue;
    // El cierre achicó el espacio r píxeles por lado: se compensa.
    regions.push({
      label,
      areaFrac,
      box: {
        x0: Math.max(0, (x0 - r) / width),
        y0: Math.max(0, (y0 - r) / height),
        x1: Math.min(1, (x1 + 1 + r) / width),
        y1: Math.min(1, (y1 + 1 + r) / height),
      },
    });
  }
  return { regions, grid: { labels, width, height } };
}

/** Fracción del recuadro que ocupa cada espacio. */
function overlapScores(box: PlanBox, grid: Grid): Map<number, number> {
  const gx0 = Math.max(0, Math.floor(box.x0 * grid.width));
  const gx1 = Math.min(grid.width, Math.ceil(box.x1 * grid.width));
  const gy0 = Math.max(0, Math.floor(box.y0 * grid.height));
  const gy1 = Math.min(grid.height, Math.ceil(box.y1 * grid.height));
  const total = Math.max(1, (gx1 - gx0) * (gy1 - gy0));
  const counts = new Map<number, number>();
  for (let y = gy0; y < gy1; y++) {
    for (let x = gx0; x < gx1; x++) {
      const l = grid.labels[y * grid.width + x];
      if (l >= 0) counts.set(l, (counts.get(l) ?? 0) + 1);
    }
  }
  for (const [l, c] of counts) counts.set(l, c / total);
  return counts;
}

/** Asigna espacios a ambientes sin repetir, de la mejor coincidencia a la peor. */
export function matchRegions(boxes: PlanBox[], regions: PlanRegion[], grid: Grid): { assigned: Array<PlanRegion | null>; unmatched: PlanRegion[] } {
  const byLabel = new Map(regions.map((r) => [r.label, r]));
  const pairs: Array<{ room: number; label: number; score: number }> = [];
  boxes.forEach((box, room) => {
    for (const [label, score] of overlapScores(box, grid)) {
      if (byLabel.has(label) && score >= MIN_MATCH) pairs.push({ room, label, score });
    }
  });
  pairs.sort((a, b) => b.score - a.score);
  const assigned: Array<PlanRegion | null> = boxes.map(() => null);
  const used = new Set<number>();
  for (const p of pairs) {
    if (assigned[p.room] || used.has(p.label)) continue;
    assigned[p.room] = byLabel.get(p.label) ?? null;
    used.add(p.label);
  }
  return { assigned, unmatched: regions.filter((r) => !used.has(r.label)) };
}

/**
 * Ubicación final: a cada ambiente, el espacio cerrado que le corresponde;
 * si no hay, su recuadro pegado a los muros. `extras`: espacios que la IA
 * no nombró.
 */
export function placeRooms<T extends { box: PlanBox }>(rooms: T[], img: GrayImage): { rooms: T[]; extras: PlanBox[] } {
  const { regions, grid } = segmentRegions(img);
  const { assigned, unmatched } = matchRegions(
    rooms.map((r) => r.box),
    regions,
    grid,
  );
  return {
    rooms: rooms.map((r, i) => ({ ...r, box: assigned[i]?.box ?? snapBoxToWalls(r.box, img) })),
    extras: unmatched.filter((r) => r.areaFrac >= MIN_EXTRA_FRAC).map((r) => r.box),
  };
}
