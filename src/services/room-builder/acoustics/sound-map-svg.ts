/**
 * Mapa de sonido a escala para la lámina PDF (SVG en texto, unidades en mm de
 * papel): celdas de la grilla coloreadas, contorno del piso, parlantes
 * numerados, escala gráfica y referencias de color debajo.
 */

import { mmAtScale, pickScale, scaleBarMeters, type PlanScale } from "../sheets/scale";
import { heatCells, heatLegend, HEAT_MODES, type HeatMode } from "./heatmap";
import type { SoundMapResult } from "./sound-map";

type Pt = { x: number; y: number };

const f = (n: number) => n.toFixed(2);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Franja inferior para la escala y las referencias (mm). */
const BAND_MM = 16;
const PAD_MM = 4;

/** Escala que entra en el área de un mapa (descontada la franja de referencias). */
export function soundMapScale(floor: Pt[], area: { w: number; h: number }): PlanScale {
  const xs = floor.map((p) => p.x);
  const ys = floor.map((p) => p.y);
  return pickScale({ widthM: Math.max(...xs) - Math.min(...xs), depthM: Math.max(...ys) - Math.min(...ys) }, { widthMm: area.w - 2 * PAD_MM, heightMm: area.h - BAND_MM - 2 * PAD_MM });
}

export function soundMapSvg(r: SoundMapResult, mode: HeatMode, floor: Pt[], area: { w: number; h: number }, scale: number): string {
  const k = mmAtScale(1, scale);
  const xs = floor.map((p) => p.x);
  const ys = floor.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const ox = (area.w - (Math.max(...xs) - minX) * k) / 2;
  const oy = PAD_MM + (area.h - BAND_MM - 2 * PAD_MM - (Math.max(...ys) - minY) * k) / 2;
  const X = (x: number) => ox + (x - minX) * k;
  const Y = (y: number) => oy + (y - minY) * k;
  const clipId = `clip-${mode}`;
  const poly = floor.map((p) => `${f(X(p.x))},${f(Y(p.y))}`).join(" ");
  const all = heatCells(r, mode);
  const rects = (aud: boolean) => all.filter((c) => c.audience === aud).map((c) => `<rect x="${f(X(c.x - c.size / 2))}" y="${f(Y(c.z - c.size / 2))}" width="${f(c.size * k + 0.2)}" height="${f(c.size * k + 0.2)}" fill="${c.color}"/>`).join("");
  // Celdas opacas apenas solapadas (sin costuras); la transparencia del borde va por grupo.
  const cells = `<g>${rects(true)}</g><g opacity="0.5">${rects(false)}</g>`;
  const spk = r.sources
    .map((s, i) => `<circle cx="${f(X(s.pos.x))}" cy="${f(Y(s.pos.z))}" r="1.6" fill="#fff" stroke="#ea580c" stroke-width="0.4"/><text x="${f(X(s.pos.x))}" y="${f(Y(s.pos.z) + 0.8)}" font-size="2.2" text-anchor="middle" font-weight="700" fill="#9a3412">${i + 1}</text>`)
    .join("");
  // Escala gráfica y referencias en la franja inferior.
  const L = scaleBarMeters(scale);
  const barW = mmAtScale(L, scale);
  const by = area.h - BAND_MM + 4;
  const bar = [0, 1, 2, 3].map((i) => `<rect x="${f(PAD_MM + (barW / 4) * i)}" y="${f(by)}" width="${f(barW / 4)}" height="1.4" fill="${i % 2 ? "#fff" : "#0f172a"}" stroke="#0f172a" stroke-width="0.2"/>`).join("");
  const legend = heatLegend(r, mode);
  let lx = PAD_MM + barW + 14;
  const stops = legend.stops
    .map((s) => {
      const w = 4 + s.label.length * 1.35;
      const out = `<rect x="${f(lx)}" y="${f(by - 0.6)}" width="3.2" height="2.6" fill="${s.color}"/><text x="${f(lx + 4)}" y="${f(by + 1.5)}" font-size="2.3" fill="#334155">${esc(s.label)}</text>`;
      lx += w + 3;
      return out;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${area.w}mm" height="${area.h}mm" viewBox="0 0 ${area.w} ${area.h}" font-family="Helvetica, Arial, sans-serif">
<defs><clipPath id="${clipId}"><polygon points="${poly}"/></clipPath></defs>
<text x="${PAD_MM}" y="3.2" font-size="3" font-weight="700" fill="#0f172a">${esc(HEAT_MODES[mode])} <tspan font-weight="400" fill="#475569">· ${esc(legend.caption)}</tspan></text>
<g clip-path="url(#${clipId})" shape-rendering="crispEdges">${cells}</g>
<polygon points="${poly}" fill="none" stroke="#0f172a" stroke-width="0.6" stroke-linejoin="round"/>
${spk}
${bar}<text x="${PAD_MM}" y="${f(by + 4.6)}" font-size="2.2" fill="#334155">0</text><text x="${f(PAD_MM + barW)}" y="${f(by + 4.6)}" font-size="2.2" text-anchor="middle" fill="#334155">${String(L).replace(".", ",")} m</text>
${stops}
</svg>`;
}
