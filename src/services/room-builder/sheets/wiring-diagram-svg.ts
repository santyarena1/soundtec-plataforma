/**
 * Diagrama de conexiones del cableado manual como SVG en texto (para las
 * láminas y la vista del cliente): el mismo esquema del plano técnico, con
 * cada equipo como bloque con los puertos de su ficha y cada cable de puerto
 * a puerto con su etiqueta.
 */

import { WIRE_SIGNAL_STYLE } from "../wiring/types";
import type { DiagramLayout } from "../wiring/diagram-layout";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Cortes posibles de un diagrama ancho: el medio de cada hueco libre entre
 * columnas de bloques (ahí no se parte ningún equipo).
 */
export function diagramCuts(blocks: Array<{ x: number; w: number }>): number[] {
  const spans = blocks.map((b) => [b.x, b.x + b.w] as const).sort((a, b) => a[0] - b[0]);
  const cuts: number[] = [];
  let end = -Infinity;
  for (const [x0, x1] of spans) {
    if (end > -Infinity && x0 > end) cuts.push(Math.round((end + x0) / 2));
    end = Math.max(end, x1);
  }
  return cuts;
}

/** Tramos [x0, x1] para partir un diagrama de `width` en `parts` partes, cortando solo en los huecos. */
export function diagramSlices(width: number, cuts: number[], parts: number): Array<[number, number]> {
  if (parts <= 1 || !cuts.length) return [[0, width]];
  const chosen: number[] = [];
  for (let i = 1; i < parts; i++) {
    const target = (width * i) / parts;
    const best = cuts.filter((c) => !chosen.includes(c) && c > (chosen[chosen.length - 1] ?? 0)).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    if (best != null) chosen.push(best);
  }
  const edges = [0, ...chosen.sort((a, b) => a - b), width];
  return edges.slice(1).map((x1, i) => [edges[i]!, x1]);
}

/**
 * El mismo SVG mostrando solo el tramo horizontal [x0, x1]. Se recorta con
 * clipPath: al encajar el dibujo en la hoja, lo que queda fuera del viewBox
 * se vería en los márgenes.
 */
export function sliceSvg(svg: string, x0: number, x1: number, height: number): string {
  const open = svg.indexOf(">") + 1;
  const close = svg.lastIndexOf("</svg>");
  const head = svg.slice(0, open).replace(/viewBox="[^"]*"/, `viewBox="${x0} 0 ${x1 - x0} ${height}"`);
  const clip = `<clipPath id="slice-${x0}"><rect x="${x0}" y="0" width="${x1 - x0}" height="${height}"/></clipPath><g clip-path="url(#slice-${x0})">`;
  return `${head}${clip}${svg.slice(open, close)}</g></svg>`;
}

/** Número de equipo en las láminas, por bloque ("deviceId#unidad" → 3). */
export type BlockNumbers = Record<string, number>;

export function wiringDiagramSvg(d: DiagramLayout, opts: { numbers?: BlockNumbers; tags?: Record<string, string> } = {}): string {
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="${d.width}" height="${d.height}" font-family="Arial, Helvetica, sans-serif"><rect width="${d.width}" height="${d.height}" fill="#ffffff"/>`);
  // Títulos de columna sobre el primer bloque de cada una.
  const firstX = new Map<string, number>();
  const colOrder = [...new Set(d.blocks.map((x) => x.column))].sort((a, c) => a - c);
  for (const b of d.blocks) {
    const title = d.columns[colOrder.indexOf(b.column)] ?? "";
    if (!firstX.has(title) || b.x < firstX.get(title)!) firstX.set(title, b.x);
  }
  for (const [title, x] of firstX) if (title) out.push(`<text x="${x}" y="40" font-size="12" font-weight="700" fill="#64748b" letter-spacing="1">${esc(title.toUpperCase())}</text>`);
  for (const b of d.blocks) {
    const head = b.remote ? "#475569" : "#1e3553";
    const n = opts.numbers?.[b.key];
    out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="#ffffff" stroke="${head}" stroke-width="1.2" ${b.noPorts ? 'stroke-dasharray="5 3"' : ""}/>`);
    out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="34" rx="6" fill="${head}"/><rect x="${b.x}" y="${b.y + 26}" width="${b.w}" height="8" fill="${head}"/>`);
    const title = `${n ? `${n} · ` : ""}${b.short}`;
    out.push(`<text x="${b.x + 9}" y="${b.y + 15}" font-size="11.5" font-weight="700" fill="#ffffff">${esc(cut(title, 34))}</text>`);
    out.push(`<text x="${b.x + 9}" y="${b.y + 28}" font-size="8.5" fill="#cbd5e1">${esc(cut(b.remote ? "Rack central" : b.label, 44))}</text>`);
    if (b.noPorts) out.push(`<text x="${b.x + 9}" y="${b.y + 50}" font-size="9" fill="#92400e">Puertos pendientes de ficha</text>`);
    for (const p of b.ports) {
      const x = p.side === "left" ? b.x : b.x + b.w;
      const tx = p.side === "left" ? x + 8 : x - 8;
      out.push(`<text x="${tx}" y="${b.y + p.y + 3}" font-size="9" text-anchor="${p.side === "left" ? "start" : "end"}" fill="${p.used ? "#0f172a" : "#94a3b8"}">${esc(cut(p.label, 26))}${p.source !== "datasheet" ? "*" : ""}</text>`);
    }
  }
  // Cables por encima de los bloques, con halo blanco: si un tramo pasa por un equipo a la
  // altura de un puerto ajeno se ve que lo cruza (por debajo parecería conectado a ese puerto).
  for (const w of d.wires) {
    const pts = w.points.map((p) => p.join(",")).join(" ");
    out.push(`<polyline points="${pts}" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round" opacity="0.9"/>`);
    out.push(`<polyline points="${pts}" fill="none" stroke="${w.color}" stroke-width="1.6" stroke-linejoin="round"/>`);
    const tag = opts.tags?.[w.id] ?? w.label;
    if (tag) {
      const [x, y] = w.points[1]!;
      out.push(`<text x="${x + 2}" y="${y - 3}" font-size="9" fill="${w.color}" stroke="#ffffff" stroke-width="2.5" paint-order="stroke">${esc(tag)}</text>`);
    }
  }
  // Puntos de conexión arriba de todo.
  for (const b of d.blocks) {
    for (const p of b.ports) {
      const color = WIRE_SIGNAL_STYLE[p.signal].color;
      out.push(`<circle cx="${p.side === "left" ? b.x : b.x + b.w}" cy="${b.y + p.y}" r="3.5" fill="${p.used ? color : "#ffffff"}" stroke="${color}" stroke-width="1"/>`);
    }
  }
  out.push(`</svg>`);
  return out.join("");
}
