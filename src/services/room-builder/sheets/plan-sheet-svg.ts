/**
 * Plantas a escala para las láminas (SVG en texto, unidades en mm de papel):
 * la sala con muros, aberturas, cotas, muebles, equipos numerados y
 * recorridos de cable coloreados por señal; y la planta general del proyecto
 * con todos los ambientes, el rack y las troncales. El SVG lleva su ancho y
 * alto en mm: impreso al 100 % la escala es real.
 */

import type { LengthKind, SheetPoint } from "./sheet-model";
import { mmAtScale, scaleBarMeters } from "./scale";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (n: number) => n.toFixed(2);
const meters = (n: number) => n.toFixed(2).replace(".", ",");

type Pt = { x: number; y: number };

/** Margen para las cotas alrededor de la planta (mm). */
export const COTA_MARGIN_MM = 16;
/** Franja inferior para la escala gráfica (mm). */
export const SCALE_BAR_BAND_MM = 14;

export const ROLE_COLOR: Record<string, string> = { display: "#e11d48", camera: "#0f766e", mic: "#7c3aed", speaker: "#ea580c", touch: "#2563eb", codec: "#1e3553", processor: "#1e3553" };

export type PlanWallInput = { a: Pt; b: Pt; lengthM: number; openings: Array<{ kind: "door" | "window"; from: number; to: number }> };
export type PlanCableInput = { tag: string; color: string; points: SheetPoint[]; lengthKind: LengthKind };
export type PlanDeviceInput = { n: number; role: string; units: SheetPoint[]; remote: boolean };

export type ScaledPlanInput = {
  /** Contorno del piso (m, x / y = z de la sala). */
  floor: Pt[];
  walls: PlanWallInput[];
  furniture: Array<{ outline: Pt[] }>;
  devices: PlanDeviceInput[];
  cables: PlanCableInput[];
  /** Salida del cableado hacia el rack central (si la sala tiene equipos centrales). */
  exit?: SheetPoint | null;
  /** Área de la lámina reservada para el dibujo (mm). */
  areaMm: { w: number; h: number };
  /** Denominador de la escala (50 → 1:50). */
  scale: number;
  /** Etiqueta de cada cable sobre su recorrido. */
  showTags?: boolean;
};

/** Área útil para la planta, descontadas las cotas y la escala gráfica (mm). */
export function drawableArea(areaMm: { w: number; h: number }): { widthMm: number; heightMm: number } {
  return { widthMm: areaMm.w - 2 * COTA_MARGIN_MM, heightMm: areaMm.h - 2 * COTA_MARGIN_MM - SCALE_BAR_BAND_MM };
}

/** Medidas de la planta (m) a partir de su contorno. */
export function planExtent(points: Pt[]): { minX: number; minY: number; widthM: number; depthM: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, widthM: Math.max(0.1, Math.max(...xs) - minX), depthM: Math.max(0.1, Math.max(...ys) - minY) };
}

/** Medidas de todo lo que se dibuja: planta, equipos (aunque estén fuera, como un rack) y recorridos. */
export function planContentExtent(input: Pick<ScaledPlanInput, "floor" | "walls" | "devices" | "cables">) {
  const pts: Pt[] = [...input.floor, ...input.walls.flatMap((w) => [w.a, w.b])];
  for (const d of input.devices) if (!d.remote) for (const u of d.units) pts.push({ x: u.x, y: u.z });
  for (const c of input.cables) for (const p of c.points) pts.push({ x: p.x, y: p.z });
  return planExtent(pts.length ? pts : [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
}

/** Transformación metros → mm de papel, con la planta centrada en el área. */
function frame(extent: ReturnType<typeof planExtent>, areaMm: { w: number; h: number }, scale: number) {
  const k = mmAtScale(1, scale);
  const usableH = areaMm.h - SCALE_BAR_BAND_MM;
  const ox = (areaMm.w - extent.widthM * k) / 2;
  const oy = (usableH - extent.depthM * k) / 2;
  return { k, X: (x: number) => ox + (x - extent.minX) * k, Y: (y: number) => oy + (y - extent.minY) * k };
}

/** Escala gráfica: barra blanca y negra en metros, con el texto de la escala. */
function scaleBar(areaMm: { w: number; h: number }, scale: number): string {
  const L = scaleBarMeters(scale);
  const len = mmAtScale(L, scale);
  const x0 = 4;
  const y0 = areaMm.h - 7;
  const parts = 4;
  const out: string[] = [];
  for (let i = 0; i < parts; i++) out.push(`<rect x="${f(x0 + (i * len) / parts)}" y="${f(y0)}" width="${f(len / parts)}" height="1.6" fill="${i % 2 ? "#ffffff" : "#111827"}" stroke="#111827" stroke-width="0.2"/>`);
  for (const [i, v] of [[0, 0], [parts / 2, L / 2], [parts, L]] as const) out.push(`<text x="${f(x0 + (i * len) / parts)}" y="${f(y0 - 1)}" font-size="2.2" text-anchor="middle" fill="#111827">${String(v).replace(".", ",")}</text>`);
  out.push(`<text x="${f(x0 + len + 2)}" y="${f(y0 + 1.5)}" font-size="2.2" fill="#111827">m</text>`);
  out.push(`<text x="${f(x0)}" y="${f(y0 + 5)}" font-size="2.6" font-weight="700" fill="#111827">ESCALA 1:${scale}</text>`);
  return out.join("");
}

/** Cota de un tramo por fuera de la planta: línea con flechas, líneas de referencia y la medida. */
function dimension(p: Pt, q: Pt, center: Pt, X: (x: number) => number, Y: (y: number) => number, k: number): string {
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  if (len < 0.3) return "";
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  let nx = -(q.y - p.y) / len;
  let ny = (q.x - p.x) / len;
  if (nx * (mx - center.x) + ny * (my - center.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  const off = 7 / k;
  const a = { x: p.x + nx * off, y: p.y + ny * off };
  const b = { x: q.x + nx * off, y: q.y + ny * off };
  const ext = 1.5 / k;
  const tx = X((a.x + b.x) / 2 + nx * (2.6 / k));
  const ty = Y((a.y + b.y) / 2 + ny * (2.6 / k));
  const ang = (Math.atan2(Y(q.y) - Y(p.y), X(q.x) - X(p.x)) * 180) / Math.PI;
  const upright = ang > 90 || ang < -90 ? ang + 180 : ang;
  return [
    `<line x1="${f(X(a.x))}" y1="${f(Y(a.y))}" x2="${f(X(b.x))}" y2="${f(Y(b.y))}" stroke="#334155" stroke-width="0.18" marker-start="url(#tick)" marker-end="url(#tick)"/>`,
    `<line x1="${f(X(p.x + nx * (1 / k)))}" y1="${f(Y(p.y + ny * (1 / k)))}" x2="${f(X(a.x + nx * ext))}" y2="${f(Y(a.y + ny * ext))}" stroke="#94a3b8" stroke-width="0.13"/>`,
    `<line x1="${f(X(q.x + nx * (1 / k)))}" y1="${f(Y(q.y + ny * (1 / k)))}" x2="${f(X(b.x + nx * ext))}" y2="${f(Y(b.y + ny * ext))}" stroke="#94a3b8" stroke-width="0.13"/>`,
    `<text x="${f(tx)}" y="${f(ty)}" font-size="2.4" fill="#111827" text-anchor="middle" dominant-baseline="middle" transform="rotate(${upright.toFixed(1)} ${f(tx)} ${f(ty)})">${meters(len)}</text>`,
  ].join("");
}

const DEFS = `<defs><marker id="tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M2,8 L8,2" stroke="#334155" stroke-width="1.6"/></marker></defs>`;

/** Recorrido de un cable: color de la señal; punteado si el largo es estimado. */
function cablePath(c: PlanCableInput, X: (x: number) => number, Y: (y: number) => number, showTag: boolean): string {
  if (c.points.length < 2) return "";
  const pts = c.points.map((p) => `${f(X(p.x))},${f(Y(p.z))}`).join(" ");
  const dash = c.lengthKind === "estimated" ? ` stroke-dasharray="1.6 0.9"` : "";
  const out = [`<polyline points="${pts}" fill="none" stroke="${c.color}" stroke-width="0.4" stroke-linejoin="round"${dash}/>`];
  if (showTag) {
    // Etiqueta en el medio del tramo más largo.
    let best = 0;
    let at = { x: c.points[0]!.x, z: c.points[0]!.z };
    for (let i = 1; i < c.points.length; i++) {
      const a = c.points[i - 1]!;
      const b = c.points[i]!;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d > best) {
        best = d;
        at = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      }
    }
    out.push(`<text x="${f(X(at.x))}" y="${f(Y(at.z) - 0.6)}" font-size="1.7" fill="${c.color}" text-anchor="middle" stroke="#ffffff" stroke-width="0.5" paint-order="stroke">${esc(c.tag)}</text>`);
  }
  return out.join("");
}

/** Marca numerada de un equipo. */
function deviceMark(n: number, role: string, x: number, y: number): string {
  const color = ROLE_COLOR[role] ?? "#334155";
  return `<circle cx="${f(x)}" cy="${f(y)}" r="2.4" fill="${color}" stroke="#ffffff" stroke-width="0.35"/><text x="${f(x)}" y="${f(y + 0.9)}" font-size="2.5" font-weight="700" fill="#ffffff" text-anchor="middle">${n}</text>`;
}

/** Salida hacia el rack central. */
function rackMark(x: number, y: number, text: string): string {
  return `<rect x="${f(x - 2.4)}" y="${f(y - 2.4)}" width="4.8" height="4.8" fill="#1e3553" stroke="#ffffff" stroke-width="0.3"/><text x="${f(x)}" y="${f(y + 0.9)}" font-size="2.5" font-weight="700" fill="#ffffff" text-anchor="middle">R</text><text x="${f(x + 3.4)}" y="${f(y + 0.8)}" font-size="2" fill="#1e3553" stroke="#ffffff" stroke-width="0.5" paint-order="stroke">${esc(text)}</text>`;
}

/** Planta de la sala a escala, lista para la lámina. */
export function scaledPlanSvg(input: ScaledPlanInput): string {
  const { w: W, h: H } = input.areaMm;
  const extent = planContentExtent(input);
  const { k, X, Y } = frame(extent, input.areaMm, input.scale);
  // Centro de la planta (no de lo dibujado): define de qué lado van cotas y puertas.
  const room = planExtent(input.floor.length ? input.floor : input.walls.flatMap((w) => [w.a, w.b]));
  const center = { x: room.minX + room.widthM / 2, y: room.minY + room.depthM / 2 };
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" font-family="Arial, Helvetica, sans-serif">${DEFS}`);
  // Piso.
  if (input.floor.length >= 3) out.push(`<polygon points="${input.floor.map((p) => `${f(X(p.x))},${f(Y(p.y))}`).join(" ")}" fill="#fafafa" stroke="none"/>`);
  // Muebles.
  for (const m of input.furniture) {
    if (m.outline.length < 3) continue;
    out.push(`<polygon points="${m.outline.map((p) => `${f(X(p.x))},${f(Y(p.y))}`).join(" ")}" fill="#eef2f6" stroke="#94a3b8" stroke-width="0.2"/>`);
  }
  // Muros con sus aberturas (espesor gráfico de un muro de 15 cm, acotado para que se lea).
  const wallMm = Math.min(3, Math.max(0.8, 0.15 * k));
  for (const w of input.walls) {
    out.push(`<line x1="${f(X(w.a.x))}" y1="${f(Y(w.a.y))}" x2="${f(X(w.b.x))}" y2="${f(Y(w.b.y))}" stroke="#111827" stroke-width="${f(wallMm)}" stroke-linecap="square"/>`);
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const at = (t: number) => ({ x: w.a.x + ((w.b.x - w.a.x) * t) / len, y: w.a.y + ((w.b.y - w.a.y) * t) / len });
    for (const o of w.openings) {
      const a = at(o.from);
      const b = at(o.to);
      out.push(`<line x1="${f(X(a.x))}" y1="${f(Y(a.y))}" x2="${f(X(b.x))}" y2="${f(Y(b.y))}" stroke="#ffffff" stroke-width="${f(wallMm + 0.4)}"/>`);
      if (o.kind === "window") {
        out.push(`<line x1="${f(X(a.x))}" y1="${f(Y(a.y))}" x2="${f(X(b.x))}" y2="${f(Y(b.y))}" stroke="#0284c7" stroke-width="0.25"/>`);
        continue;
      }
      // Puerta: hoja y arco de giro hacia el interior.
      const ux = (w.b.x - w.a.x) / len;
      const uy = (w.b.y - w.a.y) / len;
      let nx = -uy;
      let ny = ux;
      if (nx * (center.x - a.x) + ny * (center.y - a.y) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const r = o.to - o.from;
      const leaf = { x: a.x + nx * r, y: a.y + ny * r };
      const sweep = ux * ny - uy * nx > 0 ? 0 : 1;
      out.push(`<line x1="${f(X(a.x))}" y1="${f(Y(a.y))}" x2="${f(X(leaf.x))}" y2="${f(Y(leaf.y))}" stroke="#92400e" stroke-width="0.25"/>`);
      out.push(`<path d="M${f(X(leaf.x))},${f(Y(leaf.y))} A${f(r * k)},${f(r * k)} 0 0 ${sweep} ${f(X(b.x))},${f(Y(b.y))}" fill="none" stroke="#92400e" stroke-width="0.18" stroke-dasharray="0.8 0.6"/>`);
    }
  }
  // Cotas de cada muro.
  for (const w of input.walls) out.push(dimension(w.a, w.b, center, X, Y, k));
  // Cables.
  const showTags = input.showTags ?? input.cables.length <= 40;
  for (const c of input.cables) out.push(cablePath(c, X, Y, showTags));
  // Rack central (salida de la sala).
  if (input.exit && input.devices.some((d) => d.remote)) out.push(rackMark(X(input.exit.x), Y(input.exit.z), "Hacia el rack central"));
  // Equipos numerados.
  for (const d of input.devices) {
    if (d.remote || !d.n) continue;
    for (const u of d.units) out.push(deviceMark(d.n, d.role, X(u.x), Y(u.z)));
  }
  out.push(scaleBar(input.areaMm, input.scale));
  out.push(`</svg>`);
  return out.join("");
}

export type FloorRoomInput = {
  name: string;
  /** Esquina superior izquierda del ambiente en la planta general (m). */
  x0: number;
  z0: number;
  widthM: number;
  depthM: number;
  /** Equipos y cables en coordenadas de la sala (centro = 0,0). */
  devices: Array<SheetPoint & { role: string }>;
  wires: Array<{ color: string; points: SheetPoint[] }>;
  exit: SheetPoint;
  /** Cables que salen hacia el rack. */
  trunk: number;
};

export type ProjectFloorInput = {
  rooms: FloorRoomInput[];
  rack: SheetPoint | null;
  /** Plano del edificio de fondo (data URI), ubicado en metros. */
  image?: { href: string; x0: number; z0: number; widthM: number; depthM: number } | null;
  areaMm: { w: number; h: number };
  scale: number;
};

/** Medidas de la planta general (m): ambientes, rack y plano de fondo. */
export function projectFloorExtent(input: Pick<ProjectFloorInput, "rooms" | "rack" | "image">) {
  const pts: Pt[] = input.rooms.flatMap((r) => [
    { x: r.x0, y: r.z0 },
    { x: r.x0 + r.widthM, y: r.z0 + r.depthM },
  ]);
  if (input.rack) pts.push({ x: input.rack.x, y: input.rack.z });
  if (input.image) pts.push({ x: input.image.x0, y: input.image.z0 }, { x: input.image.x0 + input.image.widthM, y: input.image.z0 + input.image.depthM });
  return planExtent(pts.length ? pts : [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
}

/** Planta general del proyecto a escala: ambientes con sus equipos y cables, rack y troncales. */
export function projectFloorSvg(input: ProjectFloorInput): string {
  const { w: W, h: H } = input.areaMm;
  const extent = projectFloorExtent(input);
  const { k, X, Y } = frame(extent, input.areaMm, input.scale);
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" font-family="Arial, Helvetica, sans-serif">${DEFS}`);
  if (input.image) {
    const im = input.image;
    out.push(`<image href="${esc(im.href)}" x="${f(X(im.x0))}" y="${f(Y(im.z0))}" width="${f(im.widthM * k)}" height="${f(im.depthM * k)}" opacity="0.35" preserveAspectRatio="none"/>`);
  }
  const rack = input.rack ? { x: X(input.rack.x), y: Y(input.rack.z) } : null;
  for (const r of input.rooms) {
    const cx = r.x0 + r.widthM / 2;
    const cz = r.z0 + r.depthM / 2;
    out.push(`<rect x="${f(X(r.x0))}" y="${f(Y(r.z0))}" width="${f(r.widthM * k)}" height="${f(r.depthM * k)}" fill="${input.image ? "none" : "#fafafa"}" stroke="#111827" stroke-width="0.5"/>`);
    out.push(`<text x="${f(X(r.x0) + 1.2)}" y="${f(Y(r.z0) - 3.2)}" font-size="2.6" font-weight="700" fill="#111827" stroke="#ffffff" stroke-width="0.5" paint-order="stroke">${esc(r.name)}</text>`);
    out.push(`<text x="${f(X(r.x0) + 1.2)}" y="${f(Y(r.z0) - 0.8)}" font-size="2" fill="#475569">${meters(r.widthM)} × ${meters(r.depthM)} m</text>`);
    for (const w of r.wires) {
      if (w.points.length < 2) continue;
      out.push(`<polyline points="${w.points.map((p) => `${f(X(cx + p.x))},${f(Y(cz + p.z))}`).join(" ")}" fill="none" stroke="${w.color}" stroke-width="0.3" opacity="0.8"/>`);
    }
    for (const d of r.devices) out.push(`<circle cx="${f(X(cx + d.x))}" cy="${f(Y(cz + d.z))}" r="1.1" fill="${ROLE_COLOR[d.role] ?? "#334155"}" stroke="#ffffff" stroke-width="0.2"/>`);
    // Troncal ortogonal de la salida del ambiente al rack.
    if (rack && r.trunk > 0) {
      const e = { x: X(cx + r.exit.x), y: Y(cz + r.exit.z) };
      out.push(`<path d="M${f(e.x)},${f(e.y)} L${f(e.x)},${f(rack.y)} L${f(rack.x)},${f(rack.y)}" fill="none" stroke="#1e3553" stroke-width="0.5" stroke-dasharray="1.6 0.9"/>`);
      out.push(`<text x="${f(e.x + 1)}" y="${f(e.y - 1)}" font-size="1.8" fill="#1e3553" stroke="#ffffff" stroke-width="0.5" paint-order="stroke">${r.trunk} cables</text>`);
    }
  }
  if (rack) out.push(rackMark(rack.x, rack.y, "Rack central"));
  out.push(scaleBar(input.areaMm, input.scale));
  out.push(`</svg>`);
  return out.join("");
}
