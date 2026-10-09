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
/** Muro de doble línea: separación máxima entre las líneas y largo mínimo de cada una (fracción del lado). */
const DOUBLE_WALL_GAP = 0.015;
const DOUBLE_WALL_LINE = 0.04;
/** Abertura mínima a considerar (fracción del lado). */
const OPENING_MIN = 0.02;
/** Vanos de puerta: tramos de pared de al menos esto a cada lado, hueco de a lo sumo esto (fracción del lado). */
const DOOR_MIN_WALL = 0.03;
const DOOR_MAX_GAP = 0.16;
/** Parte del arco que tiene que estar dibujada para considerar que hay una puerta. */
const DOOR_ARC_HITS = 0.6;
/** Tramo abierto (sin muro) entre dos espacios, frente al lado del más chico y del más grande, para unirlos. */
const OPEN_MERGE_SMALL = 0.7;
const OPEN_MERGE_BIG = 0.5;
/** Trazo claro: hasta este gris, o el umbral de muro + este margen. */
const LIGHT_INK_MAX = 245;
const LIGHT_INK_DELTA = 25;
/** Hasta dónde un ambiente se suma trazos sin dueño (muebles contra la pared, muros): fracción del lado mayor. */
const ABSORB_REACH = 0.05;
/** Hueco blanco encerrado más grande que esto no es un mueble (fracción del plano). */
const POCKET_MAX = 0.03;
/**
 * Hueco más grande que se suma igual si lo encierran trazos finos (el interior de
 * un sillón en L o de una mesa grande dibujados como contorno), no muros gruesos.
 */
const FURNITURE_POCKET_MAX = 0.12;
/** Espesor máximo (fracción del lado) de un trazo de mueble; un muro es más grueso. */
const THIN_STROKE = 0.0045;
/** Hasta dónde (fracción del lado) puede pasarse un ambiente de su recuadro al llegar al muro grueso. */
const FILL_REACH = 0.08;
/** Cuánto puede pasarse un ambiente de su recuadro original al sumar muebles y muros. */
const ABSORB_MARGIN = 0.012;
/** Una línea fina (arco de puerta, contorno de mueble) mide a lo sumo esto (fracción del lado). */
const ARC_GAP = 0.005;
/** Parte del borde de un hueco que tiene que dar a un ambiente (a través de línea fina) para sumarlo. */
const THIN_POCKET_SHARE = 0.3;
/** Ancho medio mínimo de un hueco para sumarlo (fracción del lado): más fino es el interior de un muro. */
const POCKET_MIN_WIDTH = 0.015;
/** Espacios más chicos que esto son letras o ruido. */
const MIN_REGION_FRAC = 0.004;
/** Mínima superposición para asignar un espacio a un ambiente de la IA. */
const MIN_MATCH = 0.12;
/** Espacios sin nombre que vale la pena ofrecer (no placards ni ductos). */
const MIN_EXTRA_FRAC = 0.012;

function downsampleWalls(img: GrayImage): { wall: Uint8Array; light: Uint8Array; width: number; height: number } {
  const dark = inkThreshold(img);
  // Trazo claro (arcos de puertas en color, líneas finas grises): solo para reconocer puertas.
  const pale = Math.min(LIGHT_INK_MAX, dark + LIGHT_INK_DELTA);
  const scale = Math.max(1, Math.max(img.width, img.height) / SEG_MAX_SIDE);
  const width = Math.max(1, Math.round(img.width / scale));
  const height = Math.max(1, Math.round(img.height / scale));
  const wall = new Uint8Array(width * height);
  const light = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy0 = Math.floor(y * scale);
    const sy1 = Math.min(img.height, Math.ceil((y + 1) * scale));
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor(x * scale);
      const sx1 = Math.min(img.width, Math.ceil((x + 1) * scale));
      // Es muro si alguno de los píxeles que representa es oscuro.
      let ink = 0;
      let soft = 0;
      for (let sy = sy0; sy < sy1 && !ink; sy++) {
        const base = sy * img.width;
        for (let sx = sx0; sx < sx1; sx++) {
          const v = img.data[base + sx];
          if (v < pale) soft = 1;
          if (v < dark) {
            ink = 1;
            break;
          }
        }
      }
      wall[y * width + x] = ink;
      light[y * width + x] = ink || soft;
    }
  }
  return { wall, light, width, height };
}

/** Puertas (vanos con arco) y ventanas (3+ líneas finas en el muro) del plano, normalizadas. */
export function planOpenings(img: GrayImage): PlanOpening[] {
  const { wall: rawWall, light, width, height } = downsampleWalls(img);
  const doors: OpeningLine[] = [];
  bridgeDoorways(fillDoubleWalls(removeLooseInk(rawWall, width, height), width, height), light, width, height, doors);
  const side = Math.max(width, height);
  const minCells = Math.max(3, Math.round(OPENING_MIN * side));
  return [...groupOpenings(doors, width, height, "door", minCells), ...groupOpenings(findWindows(rawWall, width, height), width, height, "window", minCells)];
}

/** Trazo del plano en la grilla de trabajo (para buscar objetos dentro de los ambientes). */
export function planInkGrid(img: GrayImage): { ink: Uint8Array; width: number; height: number } {
  const { wall, width, height } = downsampleWalls(img);
  return { ink: wall, width, height };
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

/**
 * Muros de doble línea → muros sólidos: si dos líneas largas y paralelas están
 * a distancia de espesor de muro, el blanco entre ellas es muro (no un espacio
 * ni algo que un ambiente pueda sumarse).
 */
export function fillDoubleWalls(wall: Uint8Array, width: number, height: number): Uint8Array {
  const side = Math.max(width, height);
  const maxGap = Math.max(2, Math.round(DOUBLE_WALL_GAP * side));
  const minLine = Math.max(4, Math.round(DOUBLE_WALL_LINE * side));
  // Largo de la línea horizontal / vertical que pasa por cada celda de trazo.
  const hLen = new Uint16Array(wall.length);
  const vLen = new Uint16Array(wall.length);
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (!wall[y * width + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < width && wall[y * width + x]) x++;
      for (let k = start; k < x; k++) hLen[y * width + k] = Math.min(65535, x - start);
    }
  }
  for (let x = 0; x < width; x++) {
    let y = 0;
    while (y < height) {
      if (!wall[y * width + x]) {
        y++;
        continue;
      }
      const start = y;
      while (y < height && wall[y * width + x]) y++;
      for (let k = start; k < y; k++) vLen[k * width + x] = Math.min(65535, y - start);
    }
  }
  const out = new Uint8Array(wall);
  // Columnas: hueco entre dos líneas horizontales largas → muro horizontal.
  for (let x = 0; x < width; x++) {
    let lastInk = -1;
    for (let y = 0; y < height; y++) {
      if (!wall[y * width + x]) continue;
      const gap = y - lastInk - 1;
      if (lastInk >= 0 && gap > 0 && gap <= maxGap && hLen[lastInk * width + x] >= minLine && hLen[y * width + x] >= minLine) {
        for (let k = lastInk + 1; k < y; k++) out[k * width + x] = 1;
      }
      lastInk = y;
    }
  }
  // Filas: hueco entre dos líneas verticales largas → muro vertical.
  for (let y = 0; y < height; y++) {
    let lastInk = -1;
    for (let x = 0; x < width; x++) {
      if (!wall[y * width + x]) continue;
      const gap = x - lastInk - 1;
      if (lastInk >= 0 && gap > 0 && gap <= maxGap && vLen[y * width + lastInk] >= minLine && vLen[y * width + x] >= minLine) {
        for (let k = lastInk + 1; k < x; k++) out[y * width + k] = 1;
      }
      lastInk = x;
    }
  }
  return out;
}

/** Un tramo de abertura sobre una línea de la grilla (fila si es horizontal, columna si no). */
export type OpeningLine = { horizontal: boolean; line: number; a: number; b: number };
/** Abertura agrupada (todas las líneas del espesor del muro), en coordenadas normalizadas. */
export type PlanOpening = { kind: "door" | "window"; horizontal: boolean; at: number; from: number; to: number };

/** Agrupa tramos de la misma abertura (las filas o columnas del espesor del muro). */
export function groupOpenings(lines: OpeningLine[], width: number, height: number, kind: PlanOpening["kind"], minCells: number): PlanOpening[] {
  const sorted = [...lines].sort((p, q) => Number(p.horizontal) - Number(q.horizontal) || p.line - q.line || p.a - q.a);
  const groups: Array<{ horizontal: boolean; l0: number; l1: number; a: number; b: number }> = [];
  for (const l of sorted) {
    const g = groups.find((x) => x.horizontal === l.horizontal && l.line - x.l1 <= 2 && l.a <= x.b + 1 && x.a <= l.b + 1);
    if (g) {
      g.l1 = Math.max(g.l1, l.line);
      g.a = Math.min(g.a, l.a);
      g.b = Math.max(g.b, l.b);
    } else groups.push({ horizontal: l.horizontal, l0: l.line, l1: l.line, a: l.a, b: l.b });
  }
  return groups
    .filter((g) => g.b - g.a + 1 >= minCells)
    .map((g) => {
      const mid = (g.l0 + g.l1 + 1) / 2;
      return g.horizontal
        ? { kind, horizontal: true, at: mid / height, from: g.a / width, to: (g.b + 1) / width }
        : { kind, horizontal: false, at: mid / width, from: g.a / height, to: (g.b + 1) / height };
    });
}

/**
 * Ventanas: en el plano se dibujan como 3 o 4 líneas finas paralelas dentro
 * del espesor del muro (un muro común tiene 2). Se buscan en el trazo crudo.
 */
export function findWindows(raw: Uint8Array, width: number, height: number): OpeningLine[] {
  const side = Math.max(width, height);
  const maxSpan = Math.max(4, Math.round(DOUBLE_WALL_GAP * side * 1.6));
  const thin = 2;
  const out: OpeningLine[] = [];
  // Recorre columnas (muros horizontales) y filas (muros verticales).
  for (const horizontal of [true, false]) {
    const lines = horizontal ? width : height;
    const len = horizontal ? height : width;
    const at = (i: number, j: number) => (horizontal ? raw[j * width + i] : raw[i * width + j]);
    for (let i = 0; i < lines; i++) {
      let j = 0;
      const runs: Array<[number, number]> = [];
      while (j < len) {
        if (!at(i, j)) {
          j++;
          continue;
        }
        const s0 = j;
        while (j < len && at(i, j)) j++;
        runs.push([s0, j - 1]);
      }
      // 3+ trazos finos seguidos dentro de un espesor de muro.
      for (let r = 0; r + 2 < runs.length; r++) {
        const group = [runs[r]!, runs[r + 1]!, runs[r + 2]!];
        if (group.every(([p, q]) => q - p + 1 <= thin) && group[2]![1] - group[0]![0] <= maxSpan) {
          // La línea "del muro" es la fila central; el tramo se arma después agrupando columnas vecinas.
          const center = Math.round((group[0]![0] + group[2]![1]) / 2);
          out.push(horizontal ? { horizontal: true, line: center, a: i, b: i } : { horizontal: false, line: center, a: i, b: i });
          r += 2;
        }
      }
    }
  }
  return out;
}

/**
 * Cierra los vanos de puerta con una línea en el plano de la pared, de jamba a
 * jamba (como en los programas de arquitectura): así el ambiente termina en la
 * pared y no en el arco de la hoja. Solo se cierra un hueco entre dos tramos de
 * pared alineados si al lado hay trazo de puerta (hoja o arco); un paso abierto
 * o el espacio entre dos plantas dibujadas en la misma lámina no se tocan.
 */
export function bridgeDoorways(wall: Uint8Array, light: Uint8Array, width: number, height: number, doors?: OpeningLine[]): Uint8Array {
  const side = Math.max(width, height);
  const minSeg = Math.max(4, Math.round(DOOR_MIN_WALL * side));
  const maxGap = Math.max(4, Math.round(DOOR_MAX_GAP * side));
  const out = new Uint8Array(wall);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : wall[y * width + x]);
  const inkNear = (x: number, y: number) => {
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx >= 0 && yy >= 0 && xx < width && yy < height && light[yy * width + xx]) return true;
      }
    }
    return false;
  };
  /**
   * ¿Hay un arco de puerta? Cuarto de círculo con centro en la jamba (u, v),
   * radio r, que va hacia "dir" a lo largo de la pared y hacia "out" (un lado
   * del muro). (u, v) = (a lo largo, a través) del muro.
   */
  const arc = (horizontal: boolean, line: number, hinge: number, r: number, dir: 1 | -1, out: 1 | -1) => {
    let hit = 0;
    const samples = 10;
    for (let k = 0; k < samples; k++) {
      const t = ((15 + (60 * k) / (samples - 1)) * Math.PI) / 180;
      const along = hinge + dir * r * Math.cos(t);
      const across = line + out * r * Math.sin(t);
      if (horizontal ? inkNear(along, across) : inkNear(across, along)) hit++;
    }
    return hit / samples >= DOOR_ARC_HITS;
  };
  const isDoor = (horizontal: boolean, line: number, a: number, b: number) => {
    const g = b - a + 1;
    for (const out of [1, -1] as const) {
      // Una hoja: bisagra en una jamba, radio = vano.
      if (arc(horizontal, line, a - 1, g, 1, out) || arc(horizontal, line, b + 1, g, -1, out)) return true;
      // Dos hojas: bisagra en cada jamba, radio = medio vano.
      if (arc(horizontal, line, a - 1, g / 2, 1, out) && arc(horizontal, line, b + 1, g / 2, -1, out)) return true;
    }
    return false;
  };
  const scan = (horizontal: boolean) => {
    const lines = horizontal ? height : width;
    const len = horizontal ? width : height;
    for (let i = 0; i < lines; i++) {
      const get = (j: number) => (horizontal ? at(j, i) : at(i, j));
      let j = 0;
      let prevEnd = -1;
      let prevLen = 0;
      while (j < len) {
        if (!get(j)) {
          j++;
          continue;
        }
        const start = j;
        while (j < len && get(j)) j++;
        const runLen = j - start;
        const gap = start - prevEnd - 1;
        // Una jamba puede ser un muñón corto (el tabique entre dos puertas); la otra, pared.
        if (prevEnd >= 0 && Math.min(prevLen, runLen) >= 2 && Math.max(prevLen, runLen) >= minSeg && gap > 0 && gap <= maxGap) {
          const a = prevEnd + 1;
          const b = start - 1;
          if (isDoor(horizontal, i, a, b)) {
            for (let k = a; k <= b; k++) out[horizontal ? i * width + k : k * width + i] = 1;
            doors?.push({ horizontal, line: i, a, b });
          }
        }
        prevEnd = j - 1;
        prevLen = runLen;
      }
    }
  };
  scan(true);
  scan(false);
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
  const { wall: rawWall, light, width, height } = downsampleWalls(img);
  const filled = fillDoubleWalls(removeLooseInk(rawWall, width, height), width, height);
  const drawn = bridgeDoorways(filled, light, width, height);
  // Con muros gruesos, los ambientes se arman solo con ellos (más los cierres de
  // puertas): los muebles (trazo fino) no parten una sala ni se comen sus rincones.
  const walls = wallsOnly(filled, width, height);
  const wall = walls === filled ? drawn : drawn.map((v, p) => (walls[p] || (v && !filled[p]) ? 1 : 0));
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

  // 2c) Dos espacios que se tocan sin muro en una porción grande de su borde
  //     (no una puerta) son el mismo ambiente: cubículos de un baño, un estar en L.
  mergeOpenNeighbors(labels, width, height, next, coreBorder);

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
  // Exterior: lo que toca el borde de la imagen (nunca se suma a un ambiente).
  const exterior = new Set<number>();
  stats.forEach((st, label) => {
    if (coreBorder[label] || st.border) exterior.add(label);
  });
  const rooms = absorbFurniture(labels, wall, width, height, regions, exterior, Math.round(ABSORB_REACH * Math.max(width, height)), r + 2);
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
function absorbFurniture(labels: Int32Array, wall: Uint8Array, width: number, height: number, regions: PlanRegion[], exterior: Set<number>, reach: number, wallDepth: number): PlanRegion[] {
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
  // Cada hueco aceptado se suma entero de una vez (un sillón largo no se llena celda por celda).
  const pocketId = new Int32Array(labels.length).fill(-1);
  const pockets: number[][] = [];
  const seen = new Uint8Array(labels.length);
  const maxPocket = POCKET_MAX * width * height;
  const maxFurniturePocket = FURNITURE_POCKET_MAX * width * height;
  const thinCells = Math.max(2, Math.round(THIN_STROKE * Math.max(width, height)));
  const gapCells = Math.max(2, Math.round(ARC_GAP * Math.max(width, height)));
  // Hueco: blanco sin dueño o un espacio chico que no quedó como ambiente (la cuña
  // entre el arco de una puerta y la pared, un mueble que no se pudo ubicar).
  const isPocket = (q: number) => {
    if (outside[q]) return false;
    const l = labels[q];
    return l === -1 ? !wall[q] : !roomLabels.has(l) && !exterior.has(l);
  };
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
    const small = comp.length <= maxPocket || (comp.length <= maxFurniturePocket && boundedByThinStrokes(comp, labels, wall, width, height, thinCells));
    if (small && !isWallInterior(comp, labels, width, height, roomLabels, outside, gapCells)) {
      for (const p of comp) {
        pocketOk[p] = 1;
        pocketId[p] = pockets.length;
      }
      pockets.push(comp);
    }
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
        const whole = pocketOk[q] && pocketId[q] >= 0 ? pockets[pocketId[q]]! : null;
        const fits = (c: number) => !lim || (c % width >= lim.x0 && c % width < lim.x1 && Math.floor(c / width) >= lim.y0 && Math.floor(c / width) < lim.y1);
        if (whole && whole.every(fits)) {
          for (const c of whole) {
            pocketOk[c] = 0;
            labels[c] = labels[p];
            nextFrontier.push(c);
          }
        } else if ((l === -1 && wall[q]) || pocketOk[q]) {
          if (l === -1 && wall[q]) absorbedInk[q] = 1;
          pocketOk[q] = 0;
          labels[q] = labels[p];
          nextFrontier.push(q);
        }
      }
    }
    frontier = nextFrontier;
  }
  // Lo que está contra la pared (sillones en L, consolas, macetas en las esquinas): el
  // ambiente llega hasta el muro grueso, sin pasar a otro ambiente ni al exterior.
  const far = Math.round(FILL_REACH * Math.max(width, height));
  const wide = new Map([...limits].map(([l, b]) => [l, { x0: b.x0 - far, y0: b.y0 - far, x1: b.x1 + far, y1: b.y1 + far }]));
  fillToThickWalls(labels, wall, width, height, roomLabels, exterior, outside, wide, absorbedInk, thinCells);
  // Cuñas de puertas: un hueco que quedó separado de un ambiente solo por una
  // línea fina (el arco de la hoja) es de ese ambiente; detrás de un muro grueso, no.
  claimThinPockets(labels, width, height, roomLabels, isPocket, gapCells, outside);

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

/**
 * Interior de un muro doble: una franja angosta que separa dos ambientes
 * distintos (o un ambiente del exterior). Una franja angosta con el mismo
 * ambiente de los dos lados es parte de un mueble (almohadones, maceteros).
 */
/** Parte de la tinta que tiene que ser muro grueso para armar los ambientes solo con muros. */
const THICK_WALL_SHARE = 0.35;
/** Distancia (fracción del lado) a un muro grueso dentro de la cual el trazo fino se conserva (ventanas, cierres de puertas). */
const NEAR_WALL = 0.02;

/**
 * Tinta para armar ambientes: los muros gruesos y el trazo fino pegado a ellos
 * (ventanas, puertas). Los muebles sueltos en la sala no cuentan. Si el plano
 * no tiene muros gruesos (dibujo a línea simple), queda todo como estaba.
 */
function wallsOnly(wall: Uint8Array, width: number, height: number): Uint8Array {
  const side = Math.max(width, height);
  const thin = Math.max(2, Math.round(THIN_STROKE * side));
  const thick = thickWalls(wall, width, height, thin);
  let total = 0;
  let strong = 0;
  for (let p = 0; p < wall.length; p++) {
    total += wall[p]!;
    strong += thick[p]!;
  }
  if (!total || strong / total < THICK_WALL_SHARE) return wall;
  const near = dilate(thick, width, height, Math.max(1, Math.round(NEAR_WALL * side)));
  const out = new Uint8Array(wall.length);
  for (let p = 0; p < wall.length; p++) out[p] = wall[p] && near[p] ? 1 : 0;
  return out;
}

/**
 * Crece cada ambiente sobre todo lo que no es muro grueso (trazos finos de
 * muebles y el blanco entre ellos) dentro de su recuadro + margen. Se detiene en
 * los muros, en otros ambientes y en el exterior.
 */
function fillToThickWalls(
  labels: Int32Array,
  wall: Uint8Array,
  width: number,
  height: number,
  roomLabels: Set<number>,
  exterior: Set<number>,
  outside: Uint8Array,
  limits: Map<number, { x0: number; y0: number; x1: number; y1: number }>,
  absorbedInk: Uint8Array,
  thin: number,
) {
  // Libre: sin dueño, o un espacio que no quedó como ambiente (el pasillo entre un sillón y la pared).
  const free = (l: number) => l === -1 || (!roomLabels.has(l) && !exterior.has(l));
  const thick = thickWalls(wall, width, height, thin);
  const queue: number[] = [];
  for (let p = 0; p < labels.length; p++) if (roomLabels.has(labels[p])) queue.push(p);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]!;
    const own = labels[p];
    const lim = limits.get(own);
    const x = p % width;
    const ns = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < width * (height - 1) ? p + width : -1];
    for (const q of ns) {
      if (q < 0 || outside[q] || thick[q] || !free(labels[q])) continue;
      const qx = q % width;
      const qy = (q - qx) / width;
      if (lim && (qx < lim.x0 || qx >= lim.x1 || qy < lim.y0 || qy >= lim.y1)) continue;
      labels[q] = own;
      if (wall[q]) absorbedInk[q] = 1;
      queue.push(q);
    }
  }
}

/** Muros: trazo más grueso que `thin` en las dos direcciones (erosión y vuelta a engrosar). */
function thickWalls(wall: Uint8Array, width: number, height: number, thin: number): Uint8Array {
  const r = thin;
  const runH = new Uint8Array(wall.length);
  for (let y = 0; y < height; y++) {
    let run = 0;
    for (let x = 0; x < width + r; x++) {
      run = x < width && wall[y * width + x] ? run + 1 : 0;
      const cx = x - r;
      if (cx >= 0 && cx < width && run >= 2 * r + 1) runH[y * width + cx] = 1;
    }
  }
  const core = new Uint8Array(wall.length);
  for (let x = 0; x < width; x++) {
    let run = 0;
    for (let y = 0; y < height + r; y++) {
      run = y < height && runH[y * width + x] ? run + 1 : 0;
      const cy = y - r;
      if (cy >= 0 && cy < height && run >= 2 * r + 1) core[cy * width + x] = 1;
    }
  }
  const out = new Uint8Array(wall.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!core[y * width + x]) continue;
      for (let dy = -r - 1; dy <= r + 1; dy++)
        for (let dx = -r - 1; dx <= r + 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < width && yy < height && wall[yy * width + xx]) out[yy * width + xx] = 1;
        }
    }
  return out;
}

/**
 * ¿El hueco está cerrado por trazos finos? Mide el espesor de la tinta que lo
 * rodea (mediana): un contorno de mueble es una línea; un muro, un bloque.
 */
function boundedByThinStrokes(comp: number[], labels: Int32Array, wall: Uint8Array, width: number, height: number, thin: number): boolean {
  const widths: number[] = [];
  const steps: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const isInk = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && labels[y * width + x] === -1 && wall[y * width + x] === 1;
  const stride = Math.max(1, Math.floor(comp.length / 4000));
  for (let i = 0; i < comp.length; i += stride) {
    const p = comp[i]!;
    const x = p % width;
    const y = (p - x) / width;
    for (const [dx, dy] of steps) {
      if (!isInk(x + dx, y + dy)) continue;
      let n = 0;
      while (n <= thin * 3 && isInk(x + dx * (n + 1), y + dy * (n + 1))) n++;
      widths.push(n);
    }
  }
  if (!widths.length) return false;
  widths.sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)]! <= thin;
}

function isWallInterior(comp: number[], labels: Int32Array, width: number, height: number, roomLabels: Set<number>, outside: Uint8Array, gap: number): boolean {
  let bx0 = width;
  let by0 = height;
  let bx1 = 0;
  let by1 = 0;
  for (const p of comp) {
    const x = p % width;
    const y = (p - x) / width;
    if (x < bx0) bx0 = x;
    if (x > bx1) bx1 = x;
    if (y < by0) by0 = y;
    if (y > by1) by1 = y;
  }
  const thin = comp.length / (Math.max(bx1 - bx0, by1 - by0) + 1) < POCKET_MIN_WIDTH * Math.max(width, height);
  if (!thin) return false;
  const sides = new Set<number>();
  for (let y = Math.max(0, by0 - gap); y <= Math.min(height - 1, by1 + gap); y++) {
    for (let x = Math.max(0, bx0 - gap); x <= Math.min(width - 1, bx1 + gap); x++) {
      const p = y * width + x;
      if (outside[p]) return true;
      if (roomLabels.has(labels[p])) sides.add(labels[p]);
    }
  }
  return sides.size >= 2;
}

/**
 * Asigna cada hueco sin dueño al ambiente que lo rodea a través de líneas
 * finas (a no más de `gap` celdas) en buena parte de su borde.
 */
function claimThinPockets(labels: Int32Array, width: number, height: number, roomLabels: Set<number>, isPocket: (q: number) => boolean, gap: number, outside: Uint8Array) {
  const seen = new Uint8Array(labels.length);
  const stack: number[] = [];
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
    if (comp.length > POCKET_MAX * width * height) continue;
    if (isWallInterior(comp, labels, width, height, roomLabels, outside, gap)) continue;
    const inComp = new Set(comp);
    // Ambientes que tocan el hueco directo (por un vano abierto): no votan. El
    // espacio que barre una puerta es del ambiente hacia donde abre, del otro
    // lado del arco.
    const direct = new Set<number>();
    for (const p of comp) {
      const x = p % width;
      const ns = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < width * (height - 1) ? p + width : -1];
      for (const q of ns) if (q >= 0 && roomLabels.has(labels[q])) direct.add(labels[q]);
    }
    const votes = new Map<number, number>();
    let border = 0;
    for (const p of comp) {
      const x = p % width;
      const y = (p - x) / width;
      const ns = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < width * (height - 1) ? p + width : -1];
      if (ns.every((q) => q < 0 || inComp.has(q))) continue;
      border++;
      const near = new Set<number>();
      for (let dy = -gap; dy <= gap; dy++) {
        for (let dx = -gap; dx <= gap; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const l = labels[yy * width + xx];
          if (roomLabels.has(l) && !direct.has(l)) near.add(l);
        }
      }
      for (const l of near) votes.set(l, (votes.get(l) ?? 0) + 1);
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && border > 0 && best[1] >= border * THIN_POCKET_SHARE) for (const p of comp) labels[p] = best[0];
  }
}

function containsBox(outer: PlanBox, inner: PlanBox): boolean {
  const ix = Math.max(0, Math.min(inner.x1, outer.x1) - Math.max(inner.x0, outer.x0));
  const iy = Math.max(0, Math.min(inner.y1, outer.y1) - Math.max(inner.y0, outer.y0));
  const area = boxArea(inner);
  return area > 0 && (ix * iy) / area >= CONTAINED;
}

/**
 * Une espacios vecinos separados solo por el crecimiento (sin trazo entre
 * ellos) cuando el tramo abierto es grande frente al tamaño de ambos: una
 * puerta es angosta comparada con el ambiente; la abertura entre el sector del
 * inodoro y el de la bacha de un mismo baño, no.
 */
function mergeOpenNeighbors(labels: Int32Array, width: number, height: number, count: number, exterior: boolean[]) {
  const area = new Array<number>(count).fill(0);
  for (let p = 0; p < labels.length; p++) if (labels[p] >= 0) area[labels[p]]++;
  // Extensión del tramo abierto entre cada par (no la cantidad de celdas: un
  // límite escalonado contaría casi el doble).
  const open = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  const key = (a: number, b: number) => (a < b ? a * count + b : b * count + a);
  for (let p = 0; p < labels.length; p++) {
    const a = labels[p];
    if (a < 0 || exterior[a]) continue;
    const x = p % width;
    const y = (p - x) / width;
    for (const q of [x < width - 1 ? p + 1 : -1, p < width * (height - 1) ? p + width : -1]) {
      if (q < 0) continue;
      const b = labels[q];
      if (b < 0 || b === a || exterior[b]) continue;
      const k = key(a, b);
      const e = open.get(k);
      if (!e) open.set(k, { x0: x, y0: y, x1: x, y1: y });
      else {
        e.x0 = Math.min(e.x0, x);
        e.y0 = Math.min(e.y0, y);
        e.x1 = Math.max(e.x1, x);
        e.y1 = Math.max(e.y1, y);
      }
    }
  }
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [k, ext] of open) {
    const len = Math.hypot(ext.x1 - ext.x0 + 1, ext.y1 - ext.y0 + 1);
    const a = Math.floor(k / count);
    const b = k % count;
    const small = Math.sqrt(Math.min(area[a], area[b]));
    const big = Math.sqrt(Math.max(area[a], area[b]));
    if (len >= OPEN_MERGE_SMALL * small && len >= OPEN_MERGE_BIG * big) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    }
  }
  for (let p = 0; p < labels.length; p++) if (labels[p] >= 0) labels[p] = find(labels[p]);
}

/** Cuántas celdas de un grupo de espacios tocan directo (sin trazo) a otro grupo. */
export function openContact(grid: Grid, a: number[], b: number[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let n = 0;
  const { labels, width, height } = grid;
  for (let p = 0; p < labels.length; p++) {
    if (!sa.has(labels[p])) continue;
    const x = p % width;
    const ns = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < width * (height - 1) ? p + width : -1];
    if (ns.some((q) => q >= 0 && sb.has(labels[q]))) n++;
  }
  return n;
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
