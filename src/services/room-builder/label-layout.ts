/**
 * Rótulos de un plano sin encimarse (plano técnico y láminas): cada rótulo
 * de equipo va junto a su equipo y cada etiqueta de cable a lo largo de su
 * recorrido, en el primer lugar libre. Si a lo largo del recorrido no hay
 * lugar, se corre hacia afuera y lleva una línea guía hasta su cable.
 * Puro y en unidades del dibujo (px del plano técnico o mm de la lámina).
 */

export type Pt = { x: number; y: number };
/** Caja centrada en (x, y). */
export type Box = { x: number; y: number; w: number; h: number };

export type LabelRequest = {
  id: string;
  /** Ancho y alto del rótulo. */
  w: number;
  h: number;
  /** Recorrido del cable (≥ 2 puntos) o el punto del equipo (1 punto). */
  path: Pt[];
};

export type PlacedLabel = Box & { id: string; /** Punto del cable o equipo al que apunta si el rótulo quedó corrido (línea guía). */ leader: Pt | null };

/** Posiciones a lo largo de un tramo, del medio hacia las puntas. */
const ALONG = [0.5, 0.35, 0.65, 0.2, 0.8];
/** Anillos de búsqueda hacia afuera cuando el recorrido está lleno (en altos de rótulo). */
const RINGS = 8;

const overlap = (a: Box, b: Box, gap: number) => Math.abs(a.x - b.x) * 2 < a.w + b.w + gap * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap * 2;

/** Ancho aproximado de un texto (fuente proporcional; monoespaciada: 0,6). */
export function textWidth(text: string, fontSize: number, perChar = 0.58): number {
  return Math.max(1, text.length) * fontSize * perChar;
}

/** Lugares candidatos junto a un tramo: a cada lado del cable, sin taparlo. */
function alongSegment(a: Pt, b: Pt, w: number, h: number, gap: number): Pt[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  // Separación del cable según hacia dónde mira el rótulo (horizontal: medio alto; vertical: medio ancho).
  const off = Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2) + gap;
  const out: Pt[] = [];
  for (const t of ALONG) {
    const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    // Arriba / a la izquierda primero (como se lee un plano).
    const first = ny <= 0 ? 1 : -1;
    out.push({ x: m.x + nx * off * first, y: m.y + ny * off * first }, { x: m.x - nx * off * first, y: m.y - ny * off * first });
  }
  return out;
}

/** Lugares candidatos alrededor de un punto: abajo, arriba, derecha, izquierda. */
function aroundPoint(p: Pt, w: number, h: number, gap: number, reach: number): Pt[] {
  const dy = reach / 2 + h / 2 + gap;
  const dx = reach / 2 + w / 2 + gap;
  return [
    { x: p.x, y: p.y + dy },
    { x: p.x, y: p.y - dy },
    { x: p.x + dx, y: p.y },
    { x: p.x - dx, y: p.y },
  ];
}

/** Punto medio del tramo más largo (donde apunta la guía). */
function anchorOf(path: Pt[]): Pt {
  if (path.length < 2) return path[0] ?? { x: 0, y: 0 };
  let best = { l: -1, m: path[0]! };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > best.l) best = { l, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
  return best.m;
}

/**
 * Ubica los rótulos en orden (los primeros eligen antes): primero a lo largo de su
 * recorrido / junto a su equipo; si todo está ocupado, en anillos hacia afuera con
 * línea guía; si tampoco, en el primer candidato (mejor encimado que perdido).
 * `obstacles`: lo que no se puede tapar (cuerpos de los equipos). `reach`: tamaño del equipo
 * para los rótulos de un punto.
 */
export function placeLabels(labels: LabelRequest[], obstacles: Box[] = [], opts: { gap?: number; reach?: (id: string) => number } = {}): PlacedLabel[] {
  const gap = opts.gap ?? 1;
  const taken: Box[] = [...obstacles];
  const out: PlacedLabel[] = [];
  const free = (b: Box) => !taken.some((t) => overlap(b, t, gap));
  for (const l of labels) {
    const reach = opts.reach?.(l.id) ?? 0;
    const segments = l.path.slice(1).map((b, i) => ({ a: l.path[i]!, b, len: Math.hypot(b.x - l.path[i]!.x, b.y - l.path[i]!.y) }));
    const near =
      l.path.length < 2
        ? aroundPoint(l.path[0] ?? { x: 0, y: 0 }, l.w, l.h, gap, reach)
        : segments.sort((x, y) => y.len - x.len).flatMap((s) => alongSegment(s.a, s.b, l.w, l.h, gap));
    let placed: PlacedLabel | null = null;
    for (const c of near) {
      const box = { x: c.x, y: c.y, w: l.w, h: l.h };
      if (free(box)) {
        placed = { ...box, id: l.id, leader: null };
        break;
      }
    }
    if (!placed) {
      // Recorrido lleno: hacia afuera en anillos, con línea guía al cable / equipo.
      const anchor = anchorOf(l.path);
      search: for (let k = 1; k <= RINGS; k++) {
        const r = k * (l.h + gap) + reach / 2;
        for (const [ux, uy] of [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]] as const) {
          const box = { x: anchor.x + ux * (r + l.w / 2 * Math.abs(ux)), y: anchor.y + uy * r, w: l.w, h: l.h };
          if (free(box)) {
            placed = { ...box, id: l.id, leader: anchor };
            break search;
          }
        }
      }
    }
    const fallback = near[0] ?? anchorOf(l.path);
    const final = placed ?? { x: fallback.x, y: fallback.y, w: l.w, h: l.h, id: l.id, leader: null };
    taken.push(final);
    out.push(final);
  }
  return out;
}

/** Cantidad de pares de rótulos que se enciman (para tests y auditorías). */
export function overlapsCount(boxes: Box[], gap = 0): number {
  let n = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i]!, boxes[j]!, gap)) n++;
  return n;
}

/** Punto del borde de una caja más cercano a otro punto (donde arranca la línea guía). */
export function boxEdgeToward(b: Box, p: Pt): Pt {
  return { x: Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, p.x)), y: Math.max(b.y - b.h / 2, Math.min(b.y + b.h / 2, p.y)) };
}
