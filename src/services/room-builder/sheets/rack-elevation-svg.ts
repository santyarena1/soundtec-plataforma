/**
 * Dibujo del frente del rack a escala (SVG en mm de papel): bastidor de 19",
 * unidades numeradas desde abajo (U1), cada equipo con su alto real, bandejas,
 * kits de media unidad, paneles ventilados, tapas ciegas y la PDU. A la
 * derecha, una referencia por bloque (U, alto, consumo). Lo usan la pestaña
 * "Rack" (con selección) y la lámina del PDF.
 */

import { round1 } from "../rack/rack-power";
import { U_CM, type RackBlock, type RackModel, type RackZone } from "../rack/rack-elevation";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Medidas reales del bastidor (mm). */
const PANEL_MM = 482.6;
const POST_MM = 22;
const FRAME_MM = 45;
const U_MM = U_CM * 10;
/** Escalas del dibujo, de más a menos detalle. */
const SCALES = [5, 10, 15, 20] as const;

const ZONE_FILL: Record<RackZone, string> = {
  network: "#dbeafe",
  control: "#e0e7ff",
  sources: "#dcfce7",
  amps: "#fef3c7",
  power: "#fee2e2",
};
const ZONE_STROKE: Record<RackZone, string> = {
  network: "#1d4ed8",
  control: "#4338ca",
  sources: "#15803d",
  amps: "#b45309",
  power: "#b91c1c",
};

export type RackSvgOptions = {
  /** Alto máximo del dibujo en papel (mm). */
  maxHeightMm: number;
  /** Ancho de la columna de referencias (mm de papel). */
  labelsMm?: number;
  selectedKey?: string | null;
};

export type RackSvg = { svg: string; widthMm: number; heightMm: number; scale: number };

const fmt = (n: number) => String(round1(n)).replace(".", ",");

/** Consumo de un bloque (W) y si algo es estimado. */
function blockWatts(b: RackBlock): { w: number; est: boolean } | null {
  const ps = b.items.map((i) => i.power).filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (!ps.length) return null;
  return { w: b.items.reduce((a, i) => a + (i.poeFed ? 0 : (i.watts ?? i.power?.watts ?? 0)), 0), est: b.items.some((i) => !i.poeFed && i.power?.kind === "estimado") };
}

const short = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);

export function rackElevationSvg(model: RackModel, opts: RackSvgOptions): RackSvg {
  const sizeU = Math.max(1, model.sizeU);
  const realH = sizeU * U_MM + FRAME_MM * 2;
  const scale = SCALES.find((s) => realH / s <= opts.maxHeightMm) ?? SCALES[SCALES.length - 1];
  const k = 1 / scale;
  const numCol = 9;
  const postW = POST_MM * k;
  const panelW = PANEL_MM * k;
  const rackW = panelW + postW * 2;
  const frameH = FRAME_MM * k;
  const uH = U_MM * k;
  const x0 = numCol;
  const y0 = 4;
  const labelsX = x0 + rackW + 8;
  const labelsW = opts.labelsMm ?? 120;
  const width = labelsX + labelsW;
  const height = y0 + realH * k + 10;
  const font = Math.min(2.6, Math.max(1.6, uH * 0.48));
  const parts: string[] = [];

  // Bastidor y parantes.
  parts.push(`<rect x="${x0}" y="${y0}" width="${rackW}" height="${realH * k}" fill="#1f2937" rx="1"/>`);
  parts.push(`<rect x="${x0 + postW}" y="${y0 + frameH}" width="${panelW}" height="${sizeU * uH}" fill="#f8fafc"/>`);
  const yOfTop = (u: number) => y0 + frameH + (sizeU - u) * uH;

  // Numeración de U (desde abajo) y perforaciones de los parantes.
  for (let u = 1; u <= sizeU; u++) {
    const y = yOfTop(u);
    parts.push(`<line x1="${x0 + postW}" y1="${y + uH}" x2="${x0 + postW + panelW}" y2="${y + uH}" stroke="#e2e8f0" stroke-width="0.15"/>`);
    parts.push(`<text x="${x0 - 1.2}" y="${y + uH / 2 + font * 0.35}" font-size="${Math.min(2.2, font)}" text-anchor="end" fill="#475569">${u}</text>`);
    for (const px of [x0 + postW / 2, x0 + postW * 1.5 + panelW]) for (const f of [0.2, 0.5, 0.8]) parts.push(`<rect x="${px - 0.35}" y="${y + uH * f - 0.35}" width="0.7" height="0.7" fill="#64748b"/>`);
  }

  // Bloques.
  const labelGap = Math.max(font * 1.25, 3);
  let lastLabelY = -Infinity;
  for (const b of model.blocks) {
    const y = yOfTop(b.top);
    const h = b.u * uH;
    const x = x0 + postW;
    const sel = opts.selectedKey && b.key === opts.selectedKey;
    const dash = b.estimated ? ' stroke-dasharray="1.2 0.8"' : "";
    const attrs = b.movable ? ` data-key="${esc(b.key)}" style="cursor:pointer"` : "";
    if (b.kind === "blank") {
      parts.push(`<g${attrs}><rect x="${x}" y="${y}" width="${panelW}" height="${h}" fill="#e5e7eb" stroke="#9ca3af" stroke-width="0.2"/>`);
      for (let u = 0; u < b.u; u++) parts.push(`<line x1="${x}" y1="${y + (u + 1) * uH}" x2="${x + panelW}" y2="${y + (u + 1) * uH}" stroke="#9ca3af" stroke-width="0.15"/>`);
      parts.push(`<text x="${x + panelW / 2}" y="${y + h / 2 + font * 0.35}" font-size="${font}" text-anchor="middle" fill="#6b7280">Reserva ${b.u}U</text></g>`);
    } else if (b.kind === "vent") {
      const slots = Array.from({ length: 14 }, (_, i) => `<rect x="${x + panelW * 0.08 + i * panelW * 0.06}" y="${y + h * 0.25}" width="${panelW * 0.035}" height="${h * 0.5}" rx="0.3" fill="#94a3b8"/>`).join("");
      parts.push(`<rect x="${x}" y="${y}" width="${panelW}" height="${h}" fill="#f1f5f9" stroke="#94a3b8" stroke-width="0.2"/>${slots}`);
    } else {
      const zone = b.zone ?? "sources";
      const fill = b.kind === "pdu" ? ZONE_FILL.power : b.kind === "shelf" ? "#f1f5f9" : ZONE_FILL[zone];
      const stroke = sel ? "#dc2626" : b.kind === "pdu" ? ZONE_STROKE.power : ZONE_STROKE[zone];
      parts.push(`<g${attrs}><rect x="${x}" y="${y}" width="${panelW}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sel ? 0.8 : 0.3}"${dash}/>`);
      if (b.kind === "shelf") {
        // Bandeja: el estante abajo y cada equipo apoyado, a su ancho.
        parts.push(`<rect x="${x}" y="${y + h - 0.9}" width="${panelW}" height="0.9" fill="#64748b"/>`);
        const n = b.items.length;
        b.items.forEach((it, i) => {
          const bw = (panelW - 2) / n - 1;
          const bx = x + 1 + i * (bw + 1);
          parts.push(`<rect x="${bx}" y="${y + h * 0.3}" width="${bw}" height="${h * 0.7 - 0.9}" fill="${ZONE_FILL[zone]}" stroke="${ZONE_STROKE[zone]}" stroke-width="0.2"/>`);
          parts.push(`<text x="${bx + bw / 2}" y="${y + h * 0.65 + font * 0.3}" font-size="${font * 0.85}" text-anchor="middle" fill="#0f172a">${esc(short(it.name, Math.floor(bw / (font * 0.47))))}</text>`);
        });
      } else if (b.kind === "half") {
        const hw = panelW / 2;
        b.items.forEach((it, i) => {
          parts.push(`<rect x="${x + i * hw + 0.6}" y="${y + 0.5}" width="${hw - 1.2}" height="${h - 1}" fill="#fff" stroke="${ZONE_STROKE[zone]}" stroke-width="0.2"/>`);
          parts.push(`<text x="${x + i * hw + hw / 2}" y="${y + h / 2 + font * 0.35}" font-size="${font * 0.9}" text-anchor="middle" fill="#0f172a">${esc(short(it.name, Math.floor(hw / (font * 0.5))))}</text>`);
        });
      } else {
        const name = b.kind === "pdu" ? "PDU" : (b.items[0]?.name ?? b.label);
        const brand = b.items[0]?.brand;
        parts.push(`<text x="${x + 2}" y="${y + h / 2 + font * 0.35}" font-size="${font}" fill="#0f172a" font-weight="700">${esc(short(name, Math.floor((panelW - 4) / (font * 0.55))))}</text>`);
        if (brand && h >= uH * 2) parts.push(`<text x="${x + 2}" y="${y + h / 2 + font * 1.5}" font-size="${font * 0.8}" fill="#475569">${esc(short(brand, 30))}</text>`);
        // Tiradores del frente.
        parts.push(`<rect x="${x + panelW - 3}" y="${y + h * 0.2}" width="1" height="${h * 0.6}" rx="0.4" fill="#94a3b8"/>`);
      }
      parts.push("</g>");
    }

    // Referencia a la derecha (con línea guía si se corrió para no pisar la anterior).
    const cy = y + h / 2;
    const ly = Math.max(cy, lastLabelY + labelGap);
    lastLabelY = ly;
    const watts = blockWatts(b);
    const range = b.u > 1 ? `U${b.top}–${b.bottom}` : `U${b.top}`;
    const title =
      b.kind === "equipment" ? [b.items[0]?.brand, b.items[0]?.name].filter(Boolean).join(" ") : b.kind === "shelf" || b.kind === "half" ? `${b.label}: ${b.items.map((i) => i.name).join(" + ")}` : b.kind === "pdu" ? "PDU / regleta de tomas" : b.label;
    const meta = [`${b.u}U${b.estimated ? " ≈" : ""}`, watts && watts.w > 0 ? `${watts.est ? "≈ " : ""}${fmt(watts.w)} W` : null].filter(Boolean).join(" · ");
    parts.push(`<line x1="${x0 + rackW + 0.5}" y1="${cy}" x2="${labelsX - 1}" y2="${ly}" stroke="#94a3b8" stroke-width="0.15"/>`);
    parts.push(`<text x="${labelsX}" y="${ly + font * 0.35}" font-size="${font}" fill="${sel ? "#dc2626" : "#0f172a"}"><tspan font-weight="700">${range}</tspan> ${esc(short(title, Math.floor(labelsW / (font * 0.5)) - 22))} <tspan fill="#64748b">${esc(meta)}</tspan></text>`);
  }

  // Cota de alto total.
  const yb = y0 + realH * k;
  parts.push(`<text x="${x0 + rackW / 2}" y="${yb + 5}" font-size="2.6" text-anchor="middle" fill="#334155">Rack ${sizeU}U · 19" · ${fmt((sizeU * U_MM) / 10)} cm útiles</text>`);
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round1(width)} ${round1(height)}" width="${round1(width)}mm" height="${round1(height)}mm" font-family="Arial, Helvetica, sans-serif">${parts.join("")}</svg>`,
    widthMm: width,
    heightMm: height,
    scale,
  };
}
