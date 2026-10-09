/**
 * Segmentación del plano en espacios cerrados (como hacen los programas de
 * arquitectura): se detectan los muros, se cierran huecos chicos (líneas
 * punteadas, trazos cortados) y cada superficie encerrada es un ambiente.
 * Después se le asigna a cada ambiente leído por la IA el espacio que más
 * se superpone con su recuadro, sin repetir.
 */

import type { PlanBox } from "./plan-analysis";
import { regionPolygon } from "./plan-contour";
import { isAxisRect, type PlanPoint } from "./plan-polygon";
import { inkThreshold, snapBoxToWalls, type GrayImage } from "./plan-snap";

/** Espacio cerrado del plano; `polygon` cuando su forma no es un recuadro. */
export type PlanRegion = { box: PlanBox; areaFrac: number; label: number; polygon?: PlanPoint[] };
type Grid = { labels: Int32Array; width: number; height: number };

/** Lado máximo de la grilla de trabajo (velocidad vs. detalle). */
const SEG_MAX_SIDE = 700;
/** Radio de cierre de huecos chicos, en fracción del lado mayor. */
const CLOSE_RADIUS = 0.006;
/**
 * Distancia mínima a la pared para ser núcleo de un ambiente (fracción del
 * lado mayor). Por debajo están los cuellos: puertas y pasos angostos.
 */
const CORE_RADIUS = 0.03;
/** Trazos sueltos más chicos que esto (letras y números sueltos) no son muros. */
const TEXT_TINY = 0.03;
/** Renglón de texto: más angosto que esto, alargado y ralo (huecos entre letras). */
const TEXT_LINE_THICK = 0.03;
const TEXT_LINE_LONG = 0.3;
const TEXT_LINE_ASPECT = 3;
const TEXT_LINE_DENSITY = 0.85;
/** Entrantes del contorno más angostos que esto (×2) se rellenan: hojas de puerta, muebles contra la pared. */
const CONTOUR_CLOSE = 0.02;
/** Hasta dónde un ambiente se suma trazos sin dueño (muebles contra la pared, muros): fracción del lado mayor. */
const ABSORB_REACH = 0.05;
/** Hueco blanco encerrado más grande que esto no es un mueble (fracción del plano). */
const POCKET_MAX = 0.006;
/** Cuánto puede pasarse un ambiente de su recuadro original al sumar muebles y muros. */
const ABSORB_MARGIN = 0.012;
/** Espacios más chicos que esto son letras o ruido. */
const MIN_REGION_FRAC = 0.004;
/** Mínima superposición para asignar un espacio a un ambiente de la IA. */
const MIN_MATCH = 0.12;
/** Espacios sin nombre que vale la pena ofrecer (no placards ni ductos). */
const MIN_EXTRA_FRAC = 0.012;

function downsampleWalls(img: GrayImage): { wall: Uint8Array; width: number; height: number } {
  const dark = inkThreshold(img);
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
      let ink = 0;
      for (let sy = sy0; sy < sy1 && !ink; sy++) {
        const base = sy * img.width;
        for (let sx = sx0; sx < sx1; sx++) {
          if (img.data[base + sx] < dark) {
            ink = 1;
            break;
          }
        }
      }
      wall[y * width + x] = ink;
    }
  }
  return { wall, width, height };
}

/**
 * Borra los trazos sueltos chicos (letras de los rótulos, números de cotas,
 * símbolos): si quedaran, partirían los ambientes al medio.
 */
function removeLooseInk(mask: Uint8Array, width: number, height: number): Uint8Array {
  const side = Math.max(width, height);
  const out = new Uint8Array(mask);
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const comp: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    comp.length = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop() as number;
      comp.push(p);
      const x = p % width;
      const y = (p - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const q = yy * width + xx;
          if (mask[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    // Letras sueltas, o un renglón de texto (fino, alargado, con huecos entre letras).
    // Los arcos de puertas y los muros se quedan: separan ambientes.
    const long = Math.max(x1 - x0, y1 - y0) + 1;
    const short = Math.min(x1 - x0, y1 - y0) + 1;
    const density = comp.length / ((x1 - x0 + 1) * (y1 - y0 + 1));
    const tiny = long < TEXT_TINY * side;
    const textLine = short < TEXT_LINE_THICK * side && long < TEXT_LINE_LONG * side && long / short >= TEXT_LINE_ASPECT && density < TEXT_LINE_DENSITY;
    if (tiny || textLine) for (const p of comp) out[p] = 0;
  }
  return out;
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

/** Distancia (en píxeles de grilla, chamfer 3-4) de cada punto libre al trazo más cercano. */
function distanceToInk(blocked: Uint8Array, width: number, height: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = blocked[i] ? 0 : INF;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : d[y * width + x]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/**
 * Espacios del plano. Las puertas suelen estar abiertas (hueco sin hoja), así
 * que los ambientes se tocan: se separan por "cuellos". Con la distancia a los
 * muros, los núcleos anchos (lejos de toda pared) quedan aislados en cada
 * ambiente; después crecen hasta las paredes y cada puerta queda como borde.
 * Lo que toca el borde de la imagen es el exterior.
 */
export function segmentRegions(img: GrayImage): { regions: PlanRegion[]; grid: Grid; closeCells: number } {
  const { wall: rawWall, width, height } = downsampleWalls(img);
  const wall = removeLooseInk(rawWall, width, height);
  const r = Math.max(1, Math.round(CLOSE_RADIUS * Math.max(width, height)));
  const closed = dilate(wall, width, height, r);
  const dist = distanceToInk(closed, width, height);
  const coreMin = Math.max(2, CORE_RADIUS * Math.max(width, height));

  // 1) Núcleos: zonas libres lejos de toda pared.
  const labels = new Int32Array(width * height).fill(-1);
  const coreBorder: boolean[] = [];
  const stack: number[] = [];
  let next = 0;
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] !== -1 || dist[start] < coreMin) continue;
    const label = next++;
    let border = false;
    labels[start] = label;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop() as number;
      const x = p % width;
      const y = (p - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) border = true;
      const ns = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of ns) {
        if (q >= 0 && labels[q] === -1 && dist[q] >= coreMin) {
          labels[q] = label;
          stack.push(q);
        }
      }
    }
    coreBorder[label] = border;
  }

  // 2) Crecen sobre lo libre, de a un píxel por vuelta, hasta las paredes (como un watershed).
  let frontier: number[] = [];
  for (let p = 0; p < labels.length; p++) if (labels[p] !== -1) frontier.push(p);
  while (frontier.length) {
    const nextFrontier: number[] = [];
    for (const p of frontier) {
      const x = p % width;
      const ns = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < width * (height - 1) ? p + width : -1];
      for (const q of ns) {
        if (q >= 0 && labels[q] === -1 && !closed[q]) {
          labels[q] = labels[p];
          nextFrontier.push(q);
        }
      }
    }
    frontier = nextFrontier;
  }

  // 2b) El cierre achicó cada espacio r píxeles: se recupera hasta la cara real del muro.
  frontier = [];
  for (let p = 0; p < labels.length; p++) if (labels[p] !== -1) frontier.push(p);
  for (let step = 0; step < r && frontier.length; step++) {
    const nextFrontier: number[] = [];
    for (const p of frontier) {
      const x = p % width;
      const y = (p - x) / width;
      // 8 vecinos: las esquinas quedan en escuadra (con 4 saldrían ochavadas).
      const ns: number[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if ((dx || dy) && xx >= 0 && yy >= 0 && xx < width && yy < height) ns.push(yy * width + xx);
        }
      }
      for (const q of ns) {
        if (q >= 0 && labels[q] === -1 && !wall[q]) {
          labels[q] = labels[p];
          nextFrontier.push(q);
        }
      }
    }
    frontier = nextFrontier;
  }

  // 3) Recuadro y tamaño de cada espacio; el exterior (lo que toca el borde) se descarta.
  const stats = Array.from({ length: next }, () => ({ count: 0, x0: width, y0: height, x1: 0, y1: 0, border: false }));
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p];
    if (l < 0) continue;
    const s = stats[l];
    const x = p % width;
    const y = (p - x) / width;
    s.count++;
    if (x < s.x0) s.x0 = x;
    if (x > s.x1) s.x1 = x;
    if (y < s.y0) s.y0 = y;
    if (y > s.y1) s.y1 = y;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) s.border = true;
  }
  const regions: PlanRegion[] = [];
  stats.forEach((s, label) => {
    const areaFrac = s.count / (width * height);
    if (coreBorder[label] || s.border || areaFrac < MIN_REGION_FRAC) return;
    regions.push({
      label,
      areaFrac,
      box: { x0: s.x0 / width, y0: s.y0 / height, x1: Math.min(1, (s.x1 + 1) / width), y1: Math.min(1, (s.y1 + 1) / height) },
    });
  });
  const grid = { labels, width, height };
  const closeCells = Math.max(1, Math.round(CONTOUR_CLOSE * Math.max(width, height)));
  // 4) Los muebles son parte del ambiente: lo encerrado (mostrador, isla) y lo
  //    pegado a la pared (sillones, macetas) se suma al ambiente que lo rodea.
  const tiny = new Set<number>();
  stats.forEach((st, label) => {
    if (!coreBorder[label] && !st.border && st.count / (width * height) < MIN_REGION_FRAC) tiny.add(label);
  });
  const rooms = absorbFurniture(labels, wall, width, height, regions, tiny, Math.round(ABSORB_REACH * Math.max(width, height)), r + 2);
  const kept = rooms.map((reg) => {
    const polygon = regionPolygon(grid, [reg.label], closeCells);
    // Un recuadro no necesita polígono: solo las formas en L, ochavas, etc.
    return polygon && !isAxisRect(polygon) ? { ...reg, polygon } : reg;
  });
  return { regions: kept, grid, closeCells };
}

/**
 * Suma los muebles a los ambientes. Los espacios "mueble" (dentro de otro y
 * mucho más chicos) pasan a ser del ambiente que los contiene; después cada
 * ambiente crece sobre trazos y huecos sin dueño (contornos de muebles contra
 * la pared, hojas de puerta, muros) hasta `reach` celdas, sin pisar otros
 * ambientes ni el exterior. Devuelve los ambientes con su tamaño actualizado.
 */
function absorbFurniture(labels: Int32Array, wall: Uint8Array, width: number, height: number, regions: PlanRegion[], tiny: Set<number>, reach: number, wallDepth: number): PlanRegion[] {
  const rooms = dropFurniture(regions);
  const roomLabels = new Set(rooms.map((r) => r.label));
  // Mueble → ambiente que lo contiene (el más chico que lo encierra).
  const owner = new Map<number, number>();
  for (const f of regions) {
    if (roomLabels.has(f.label)) continue;
    const host = rooms.filter((o) => containsBox(o.box, f.box)).sort((a, b) => a.areaFrac - b.areaFrac)[0];
    if (host) owner.set(f.label, host.label);
  }
  let frontier: number[] = [];
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p];
    const host = owner.get(l);
    if (host !== undefined) labels[p] = host;
    if (roomLabels.has(labels[p])) frontier.push(p);
  }
  // Exterior: el blanco conectado al borde de la imagen sin cruzar trazos ni ambientes.
  const outside = new Uint8Array(labels.length);
  const stack: number[] = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const p = stack.pop() as number;
    if (outside[p] || wall[p] || roomLabels.has(labels[p])) continue;
    outside[p] = 1;
    const x = p % width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (p >= width) stack.push(p - width);
    if (p < width * (height - 1)) stack.push(p + width);
  }
  // Huecos blancos sin dueño: solo los chicos son interiores de muebles. Los
  // grandes (un placard o pasillo que no se detectó) no se tocan.
  const pocketOk = new Uint8Array(labels.length);
  const seen = new Uint8Array(labels.length);
  const maxPocket = POCKET_MAX * width * height;
  const isPocket = (q: number) => !outside[q] && ((labels[q] === -1 && !wall[q]) || tiny.has(labels[q]));
  for (let start = 0; start < labels.length; start++) {
    if (seen[start] || !isPocket(start)) continue;
    const comp: number[] = [];
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop() as number;
      comp.push(p);
      const x = p % width;
      const ns = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < width * (height - 1) ? p + width : -1];
      for (const q of ns) {
        if (q >= 0 && !seen[q] && isPocket(q)) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (comp.length <= maxPocket) for (const p of comp) pocketOk[p] = 1;
  }
  const absorbedInk = new Uint8Array(labels.length);
  // Cada ambiente solo suma dentro de su recuadro original + el espesor de un muro:
  // un sillón contra la pared está adentro; el ambiente de al lado, no.
  const margin = Math.max(1, Math.round(ABSORB_MARGIN * Math.max(width, height)));
  const limits = new Map(
    rooms.map((r) => [
      r.label,
      { x0: Math.floor(r.box.x0 * width) - margin, y0: Math.floor(r.box.y0 * height) - margin, x1: Math.ceil(r.box.x1 * width) + margin, y1: Math.ceil(r.box.y1 * height) + margin },
    ]),
  );
  for (let step = 0; step < reach && frontier.length; step++) {
    const nextFrontier: number[] = [];
    for (const p of frontier) {
      const x = p % width;
      const lim = limits.get(labels[p]);
      const ns = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < width * (height - 1) ? p + width : -1];
      for (const q of ns) {
        if (q < 0 || outside[q]) continue;
        const qx = q % width;
        const qy = (q - qx) / width;
        if (lim && (qx < lim.x0 || qx >= lim.x1 || qy < lim.y0 || qy >= lim.y1)) continue;
        const l = labels[q];
        if ((l === -1 && wall[q]) || pocketOk[q]) {
          if (l === -1 && wall[q]) absorbedInk[q] = 1;
          pocketOk[q] = 0;
          labels[q] = labels[p];
          nextFrontier.push(q);
        }
      }
    }
    frontier = nextFrontier;
  }
  // Los muros vuelven a ser muros: se pela el trazo sumado que toca el exterior u
  // otro ambiente, capa por capa, hasta el espesor de un muro. Los contornos de
  // muebles (adentro del ambiente) no tocan nada de eso y se quedan.
  const blocks = (p: number, own: number) => {
    const l = labels[p];
    return outside[p] === 1 || (l !== own && l !== -1) || (l === -1 && !wall[p]);
  };
  for (let layer = 0; layer < wallDepth; layer++) {
    const peel: number[] = [];
    for (let p = 0; p < labels.length; p++) {
      if (!absorbedInk[p]) continue;
      const own = labels[p];
      const x = p % width;
      const edge = x === 0 || x === width - 1 || p < width || p >= width * (height - 1);
      const ns = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < width * (height - 1) ? p + width : -1];
      if (edge || ns.some((q) => q >= 0 && (blocks(q, own) || (labels[q] === -1 && wall[q])))) peel.push(p);
    }
    if (!peel.length) break;
    for (const p of peel) {
      labels[p] = -1;
      absorbedInk[p] = 0;
    }
  }
  // Recuadro y superficie con lo sumado.
  const byLabel = new Map(rooms.map((r) => [r.label, { count: 0, x0: width, y0: height, x1: 0, y1: 0 }]));
  for (let p = 0; p < labels.length; p++) {
    const st = byLabel.get(labels[p]);
    if (!st) continue;
    const x = p % width;
    const y = (p - x) / width;
    st.count++;
    if (x < st.x0) st.x0 = x;
    if (x > st.x1) st.x1 = x;
    if (y < st.y0) st.y0 = y;
    if (y > st.y1) st.y1 = y;
  }
  return rooms.map((r) => {
    const st = byLabel.get(r.label)!;
    return { ...r, areaFrac: st.count / (width * height), box: { x0: st.x0 / width, y0: st.y0 / height, x1: Math.min(1, (st.x1 + 1) / width), y1: Math.min(1, (st.y1 + 1) / height) } };
  });
}

function containsBox(outer: PlanBox, inner: PlanBox): boolean {
  const ix = Math.max(0, Math.min(inner.x1, outer.x1) - Math.max(inner.x0, outer.x0));
  const iy = Math.max(0, Math.min(inner.y1, outer.y1) - Math.max(inner.y0, outer.y0));
  const area = boxArea(inner);
  return area > 0 && (ix * iy) / area >= CONTAINED;
}

/** Un espacio dentro de otro y mucho más chico es un mueble (mostrador, sillón, maceta), no un ambiente. */
const FURNITURE_MAX_SHARE = 0.3;
const CONTAINED = 0.9;

function boxArea(b: PlanBox): number {
  return Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
}

function dropFurniture(regions: PlanRegion[]): PlanRegion[] {
  return regions.filter((r) => {
    const area = boxArea(r.box);
    return !regions.some((o) => {
      if (o === r || o.areaFrac <= r.areaFrac) return false;
      const ix = Math.max(0, Math.min(r.box.x1, o.box.x1) - Math.max(r.box.x0, o.box.x0));
      const iy = Math.max(0, Math.min(r.box.y1, o.box.y1) - Math.max(r.box.y0, o.box.y0));
      return area > 0 && (ix * iy) / area >= CONTAINED && r.areaFrac <= o.areaFrac * FURNITURE_MAX_SHARE;
    });
  });
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
export function placeRooms<T extends { box: PlanBox; polygon?: PlanPoint[] }>(rooms: T[], img: GrayImage): { rooms: T[]; extras: PlanBox[] } {
  const { regions, grid } = segmentRegions(img);
  const { assigned, unmatched } = matchRegions(
    rooms.map((r) => r.box),
    regions,
    grid,
  );
  return {
    rooms: rooms.map((r, i) => {
      const region = assigned[i];
      if (!region) return { ...r, box: snapBoxToWalls(r.box, img) };
      return region.polygon ? { ...r, box: region.box, polygon: region.polygon } : { ...r, box: region.box };
    }),
    extras: unmatched.filter((r) => r.areaFrac >= MIN_EXTRA_FRAC).map((r) => r.box),
  };
}
