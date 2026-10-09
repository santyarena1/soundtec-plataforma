/**
 * Dibujos de la propuesta como SVG (texto), para el PDF: el plano de la sala
 * con cotas, aberturas, mobiliario y equipos numerados, y el diagrama de
 * conexiones.
 */

import type { CableLink } from "./cabling";
import type { Diagram } from "./connection-diagram";
import { SIGNAL_INFO } from "./device-ports";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type PlanMark = { n: number; x: number; z: number; role: string };
export type PlanFurniture = { x: number; z: number; w: number; d: number; rotY: number };
export type PlanOpening = { a: { x: number; y: number }; b: { x: number; y: number }; kind: "door" | "window" };

const ROLE_COLOR: Record<string, string> = { display: "#e11d48", camera: "#0f766e", mic: "#7c3aed", speaker: "#ea580c", touch: "#2563eb", codec: "#1e3553", processor: "#1e3553" };

/** Plano con cotas: piso, muros con su medida, aberturas, muebles, equipos numerados y (opcional) recorridos de cable. */
export function planSvg(input: {
  floor: Array<{ x: number; y: number }>;
  furniture: PlanFurniture[];
  marks: PlanMark[];
  openings: PlanOpening[];
  cables?: CableLink[];
  width?: number;
  height?: number;
}): string {
  const W = input.width ?? 700;
  const H = input.height ?? 520;
  const pad = 70;
  const xs = input.floor.map((p) => p.x);
  const ys = input.floor.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const k = Math.min((W - 2 * pad) / Math.max(0.1, maxX - minX), (H - 2 * pad) / Math.max(0.1, maxY - minY));
  const X = (x: number) => pad + (x - minX) * k;
  const Y = (y: number) => pad + (y - minY) * k;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  // Piso y muros.
  const poly = input.floor.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  out.push(`<polygon points="${poly}" fill="#f8fafc" stroke="#1f2937" stroke-width="5" stroke-linejoin="miter"/>`);
  // Aberturas: hueco blanco en el muro + símbolo.
  for (const o of input.openings) {
    out.push(`<line x1="${X(o.a.x)}" y1="${Y(o.a.y)}" x2="${X(o.b.x)}" y2="${Y(o.b.y)}" stroke="#ffffff" stroke-width="6"/>`);
    out.push(`<line x1="${X(o.a.x)}" y1="${Y(o.a.y)}" x2="${X(o.b.x)}" y2="${Y(o.b.y)}" stroke="${o.kind === "door" ? "#92400e" : "#0284c7"}" stroke-width="1.5" ${o.kind === "window" ? 'stroke-dasharray="3 2"' : ""}/>`);
  }
  // Muebles.
  for (const f of input.furniture) {
    const cx = X(f.x);
    const cy = Y(f.z);
    out.push(`<rect x="${(cx - (f.w * k) / 2).toFixed(1)}" y="${(cy - (f.d * k) / 2).toFixed(1)}" width="${(f.w * k).toFixed(1)}" height="${(f.d * k).toFixed(1)}" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1" transform="rotate(${((-f.rotY * 180) / Math.PI).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`);
  }
  // Recorridos de cable en planta.
  for (const c of input.cables ?? []) {
    if (c.signal === "wireless") continue;
    const pts = c.route.map((p) => `${X(p[0]).toFixed(1)},${Y(p[2]).toFixed(1)}`).join(" ");
    out.push(`<polyline points="${pts}" fill="none" stroke="${SIGNAL_INFO[c.signal].color}" stroke-width="1" opacity="0.55"/>`);
  }
  // Cotas: cada muro, por fuera del polígono.
  const cx0 = (minX + maxX) / 2;
  const cy0 = (minY + maxY) / 2;
  input.floor.forEach((p, i) => {
    const q = input.floor[(i + 1) % input.floor.length]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 0.3) return;
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    let nx = -(q.y - p.y) / len;
    let ny = (q.x - p.x) / len;
    if (nx * (mx - cx0) + ny * (my - cy0) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const off = 26 / k;
    const a = { x: p.x + nx * off, y: p.y + ny * off };
    const b = { x: q.x + nx * off, y: q.y + ny * off };
    out.push(`<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="#475569" stroke-width="0.8" marker-start="url(#arr)" marker-end="url(#arr)"/>`);
    out.push(`<line x1="${X(p.x)}" y1="${Y(p.y)}" x2="${X(a.x + nx * (6 / k))}" y2="${Y(a.y + ny * (6 / k))}" stroke="#94a3b8" stroke-width="0.6"/>`);
    out.push(`<line x1="${X(q.x)}" y1="${Y(q.y)}" x2="${X(b.x + nx * (6 / k))}" y2="${Y(b.y + ny * (6 / k))}" stroke="#94a3b8" stroke-width="0.6"/>`);
    const tx = X((a.x + b.x) / 2 + nx * (12 / k));
    const ty = Y((a.y + b.y) / 2 + ny * (12 / k));
    const ang = (Math.atan2(Y(q.y) - Y(p.y), X(q.x) - X(p.x)) * 180) / Math.PI;
    const upright = ang > 90 || ang < -90 ? ang + 180 : ang;
    out.push(`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="11" fill="#1f2937" text-anchor="middle" dominant-baseline="middle" transform="rotate(${upright.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})">${len.toFixed(2).replace(".", ",")} m</text>`);
  });
  // Equipos numerados.
  for (const m of input.marks) {
    const color = ROLE_COLOR[m.role] ?? "#334155";
    out.push(`<circle cx="${X(m.x).toFixed(1)}" cy="${Y(m.z).toFixed(1)}" r="8" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>`);
    out.push(`<text x="${X(m.x).toFixed(1)}" y="${(Y(m.z) + 3.5).toFixed(1)}" font-size="9" font-weight="700" fill="#ffffff" text-anchor="middle">${m.n}</text>`);
  }
  out.push(`<defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,2 L10,5 L0,8" fill="none" stroke="#475569"/></marker></defs>`);
  out.push(`</svg>`);
  return out.join("");
}

/** Diagrama de conexiones como SVG (mismo dibujo que en pantalla). */
export function diagramSvg(d: Diagram): string {
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="${d.width}" height="${d.height}" font-family="Arial, sans-serif"><rect width="${d.width}" height="${d.height}" fill="#ffffff"/>`);
  d.columns.forEach((t, c) => out.push(`<text x="${30 + c * 370}" y="30" font-size="12" font-weight="700" fill="#64748b" letter-spacing="1">${esc(t.toUpperCase())}</text>`));
  for (const w of d.wires) {
    out.push(`<polyline points="${w.points.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${w.color}" stroke-width="1.8" ${w.dashed ? 'stroke-dasharray="6 4"' : ""}/>`);
    out.push(`<text x="${(w.points[1]![0] + w.points[2]![0]) / 2 + 4}" y="${(w.points[1]![1] + w.points[2]![1]) / 2}" font-size="9" fill="${w.color}">${esc(w.label)}</text>`);
  }
  for (const b of d.blocks) {
    const head = b.virtual ? "#e2e8f0" : "#1e3553";
    out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="${b.virtual ? "#f8fafc" : "#ffffff"}" stroke="${b.virtual ? "#94a3b8" : "#1e3553"}" stroke-width="1.2" ${b.virtual ? 'stroke-dasharray="4 3"' : ""}/>`);
    out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="24" rx="8" fill="${head}"/><rect x="${b.x}" y="${b.y + 16}" width="${b.w}" height="8" fill="${head}"/>`);
    out.push(`<text x="${b.x + 10}" y="${b.y + 16}" font-size="11" font-weight="600" fill="${b.virtual ? "#334155" : "#ffffff"}">${esc(b.label.length > 34 ? `${b.label.slice(0, 33)}…` : b.label)}</text>`);
    for (const p of b.inputs) {
      out.push(`<circle cx="${b.x}" cy="${p.y}" r="3.5" fill="${p.used ? SIGNAL_INFO[p.signal].color : "#ffffff"}" stroke="${SIGNAL_INFO[p.signal].color}"/>`);
      out.push(`<text x="${b.x + 8}" y="${p.y + 3}" font-size="9.5" fill="${p.used ? "#0f172a" : "#94a3b8"}">${esc(p.label)}</text>`);
    }
    for (const p of b.outputs) {
      out.push(`<circle cx="${b.x + b.w}" cy="${p.y}" r="3.5" fill="${p.used ? SIGNAL_INFO[p.signal].color : "#ffffff"}" stroke="${SIGNAL_INFO[p.signal].color}"/>`);
      out.push(`<text x="${b.x + b.w - 8}" y="${p.y + 3}" font-size="9.5" text-anchor="end" fill="${p.used ? "#0f172a" : "#94a3b8"}">${esc(p.label)}</text>`);
    }
  }
  out.push(`</svg>`);
  return out.join("");
}
