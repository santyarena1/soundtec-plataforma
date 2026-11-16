/**
 * Colores del mapa de sonido (los mismos en el editor y en la lámina PDF):
 * celdas de la grilla con su color según el modo y la escala de referencia.
 *
 *   spl / direct   escala secuencial (viridis) entre el mínimo y el máximo del mapa (al menos 6 dB)
 *   uniformity     desvío respecto del promedio: verde dentro de ± objetivo, ámbar hasta el doble, rojo afuera
 *   sti            categorías de IEC 60268-16 (mala → excelente)
 */

import { USE_TARGETS } from "./materials";
import type { SoundMapResult } from "./sound-map";

export type HeatMode = "spl" | "direct" | "sti" | "uniformity";

export const HEAT_MODES: Record<HeatMode, string> = {
  spl: "SPL total",
  direct: "Campo directo",
  sti: "STI",
  uniformity: "Uniformidad",
};

export type HeatCell = { x: number; z: number; size: number; color: string; value: number; audience: boolean };
export type HeatLegend = { stops: Array<{ color: string; label: string }>; unit: string; caption: string };

const VIRIDIS = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"];
/**
 * STI: rampa continua anclada en los límites de calificación de IEC 60268-16 (anexo F),
 * así se ve la variación dentro de una misma categoría.
 */
const STI_STOPS: Array<{ v: number; color: string; label: string }> = [
  { v: 0.3, color: "#b91c1c", label: "0,30 mala/pobre" },
  { v: 0.45, color: "#ea580c", label: "0,45 regular" },
  { v: 0.6, color: "#eab308", label: "0,60 buena" },
  { v: 0.75, color: "#65a30d", label: "0,75 excelente" },
  { v: 0.9, color: "#15803d", label: "0,90" },
];

const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

function hex(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

/** Color de la escala secuencial para t en 0..1. */
export function viridis(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (VIRIDIS.length - 1);
  const i = Math.min(VIRIDIS.length - 2, Math.floor(x));
  return mix(VIRIDIS[i]!, VIRIDIS[i + 1]!, x - i);
}

/** Mezcla lineal de dos colores #rrggbb (t en 0..1). */
function mix(c1: string, c2: string, t: number): string {
  const a = hex(c1);
  const b = hex(c2);
  return `#${a.map((v, k) => Math.round(v + (b[k]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Color del STI por interpolación entre los anclajes de calificación. */
export function stiColor(sti: number): string {
  const s = STI_STOPS;
  if (sti <= s[0]!.v) return s[0]!.color;
  for (let i = 0; i < s.length - 1; i++) {
    if (sti <= s[i + 1]!.v) return mix(s[i]!.color, s[i + 1]!.color, (sti - s[i]!.v) / (s[i + 1]!.v - s[i]!.v));
  }
  return s[s.length - 1]!.color;
}

/** Rango de la escala de SPL (o campo directo) del mapa: mínimo a máximo, al menos 6 dB. */
export function splRange(values: number[]): { lo: number; hi: number } {
  if (!values.length) return { lo: 60, hi: 90 };
  let lo = Math.floor(Math.min(...values));
  let hi = Math.ceil(Math.max(...values));
  if (hi - lo < 6) {
    const mid = (hi + lo) / 2;
    lo = Math.floor(mid - 3);
    hi = lo + 6;
  }
  return { lo, hi };
}

function uniformityColor(dev: number, tol: number): string {
  const a = Math.abs(dev);
  if (a <= tol) return "#16a34a";
  if (a <= tol * 2) return "#f59e0b";
  return "#dc2626";
}

/** Celdas coloreadas del mapa en el modo pedido. */
export function heatCells(r: SoundMapResult, mode: HeatMode): HeatCell[] {
  const g = r.grid;
  const src = mode === "sti" ? g.sti : mode === "direct" ? g.direct : g.spl;
  const values = src.filter((v, i): v is number => v != null && g.audience[i]!);
  const { lo, hi } = splRange(values);
  const avg = r.stats?.splAvg ?? 0;
  const tol = USE_TARGETS[r.use].uniformityDb;
  const out: HeatCell[] = [];
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (v == null) continue;
    const c = i % g.cols;
    const row = Math.floor(i / g.cols);
    const color = mode === "sti" ? stiColor(v) : mode === "uniformity" ? uniformityColor(v - avg, tol) : viridis((v - lo) / (hi - lo));
    out.push({ x: g.x0 + c * g.step, z: g.z0 + row * g.step, size: g.step, color, value: v, audience: g.audience[i]! });
  }
  return out;
}

/** Referencias de color del modo. */
export function heatLegend(r: SoundMapResult, mode: HeatMode): HeatLegend {
  const g = r.grid;
  if (mode === "sti") return { stops: STI_STOPS.map((b) => ({ color: b.color, label: b.label })), unit: "STI", caption: "STI al nivel de operación (IEC 60268-16, método indirecto)" };
  if (mode === "uniformity") {
    const tol = USE_TARGETS[r.use].uniformityDb;
    return {
      stops: [
        { color: "#16a34a", label: `dentro de ±${tol} dB` },
        { color: "#f59e0b", label: `±${tol}–${tol * 2} dB` },
        { color: "#dc2626", label: `más de ±${tol * 2} dB` },
      ],
      unit: "dB",
      caption: `Desvío respecto del promedio (${r.stats ? fmt(r.stats.splAvg) : "—"} dB)`,
    };
  }
  const values = (mode === "direct" ? g.direct : g.spl).filter((v, i): v is number => v != null && g.audience[i]!);
  const { lo, hi } = splRange(values);
  const steps = 5;
  return {
    stops: Array.from({ length: steps }, (_, k) => {
      const v = lo + ((hi - lo) * k) / (steps - 1);
      return { color: viridis(k / (steps - 1)), label: `${fmt(v, 0)} dB` };
    }),
    unit: "dB SPL",
    caption: mode === "direct" ? "Solo campo directo de los parlantes (cobertura)" : "Directo + reverberante, a la potencia máxima disponible (tap o canal)",
  };
}
