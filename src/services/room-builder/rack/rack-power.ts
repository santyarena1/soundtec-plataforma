/**
 * Consumo eléctrico y calor de los equipos de un rack. Lógica pura, sin base.
 *
 * El consumo sale de la ficha del fabricante (tabla de especificaciones del
 * portal): primero "Power Consumption" / "Consumption" / "Input Power"; si no
 * está, del calor declarado ("Heat Dissipation", BTU/h ÷ 3,412). En
 * amplificadores se prefiere el consumo a 1/8 de potencia (la condición de
 * uso típica con programa musical); en el resto, el típico. Sin dato en la
 * ficha se estima por tipo de equipo y queda marcado como estimado.
 */

import type { DeviceClass } from "../device-ports";

/** 1 W = 3,412 BTU/h. */
export const BTU_PER_W = 3.412;
/** Tensión de red para la corriente y la PDU (V). */
export const MAINS_V = 220;
/** Carga continua máxima de un circuito / PDU: 80 % de su corriente nominal. */
export const CONTINUOUS_LOAD = 0.8;
/** Corrientes nominales comerciales de PDU (A). */
export const PDU_AMPS = [10, 16, 20, 32] as const;
/** Cantidad de tomas de PDU comerciales (horizontal 1U hasta 12; más, vertical 0U). */
export const PDU_OUTLETS = [6, 8, 10, 12, 16, 20, 24] as const;
/** Tomas libres de reserva en la PDU: 25 % de las usadas (mínimo 2). */
const OUTLET_RESERVE = 0.25;

/**
 * Ventilación de un rack cerrado (criterio usado, con el calor total dentro del rack):
 * hasta 300 W se disipa en forma pasiva (tapas ventiladas arriba y abajo, panel
 * ventilado sobre cada amplificador); de 300 a 1500 W hace falta ventilación
 * forzada (bandeja de ventiladores en el techo, extrayendo); más de 1500 W,
 * además, sala técnica climatizada.
 */
export const PASSIVE_MAX_W = 300;
export const FORCED_MAX_W = 1500;
/** Caudal de aire para sacar el calor con un salto de 15 °F (≈ 8 °C): CFM = 3,16 × W ÷ ΔT(°F). */
const DELTA_T_F = 15;

/** Amplificador sin consumo en la ficha: rendimiento a 1/8 de potencia y consumo en reposo (estimados). */
const AMP_EFFICIENCY_EIGHTH = 0.6;
const AMP_IDLE_W = 15;
const AMP_FALLBACK_W = 150;

/** Consumo típico por tipo de equipo cuando la ficha no lo dice (W, estimado). */
const CLASS_ESTIMATE_W: Partial<Record<DeviceClass, number>> = {
  switch: 25,
  control: 15,
  codec: 40,
  dsp: 30,
  "video-switch": 35,
  streamer: 20,
  source: 25,
  other: 12,
};
const DEFAULT_ESTIMATE_W = 15;

export type SpecRow = { label?: unknown; labelEs?: unknown; value?: unknown; valueEs?: unknown };

/** 1/8: a 1/8 de potencia (amplificadores); no-poe: switch sin cargas PoE; plain: sin condición aclarada. */
export type PowerBasis = "1/8" | "typical" | "no-poe" | "plain" | "max";

export type PowerReading = { watts: number; basis: PowerBasis; fromHeat: boolean; evidence: string };

/** De dónde sale el consumo de un equipo. */
export type PowerKind = "ficha" | "ficha-calor" | "estimado";

export const POWER_KIND_LABEL: Record<PowerKind, string> = {
  ficha: "Ficha",
  "ficha-calor": "Ficha (calor)",
  estimado: "Estimado",
};

const POWER_LABEL = /^(power consumption|consumption|input power|overall power|power usage|typical power|power draw|consumo|consumo el[eé]ctrico|potencia de entrada|potencia consumida)\b/i;
const HEAT_LABEL = /^(heat dissipation|btu\/h|disipaci[oó]n( t[eé]rmica)?|calor)\b/i;
/** Etiquetas de consumo que no son el de uso: en reposo, con PoE a pleno, etc. */
const SKIP_LABEL = /idle|standby|stand-by|low power|with poe|con poe|in use, powered via|reposo/i;

const num = (s: string) => Number(s.replace(",", "."));

type Hit = { value: number; basis: PowerBasis | null; evidence: string };

/**
 * Valores de una celda de la ficha con su condición. La celda se parte por
 * ";" y, dentro de cada tramo, cada número se clasifica por el texto que lo
 * sigue ("typical", "idle", "1/8th output power") y el que lo precede
 * ("Max PoE:", "No PoE:", "Standby:").
 */
function hitsOf(text: string, unit: RegExp, labelBasis: PowerBasis | null): Hit[] {
  const out: Hit[] = [];
  for (const seg of text.split(/;|\n/)) {
    // Fórmulas en función de la carga ("+ 4,7 BTU/h × corriente"): no es un valor.
    if (/x\s*load|per\s*amp/i.test(seg)) continue;
    const matches = [...seg.matchAll(unit)];
    matches.forEach((m, i) => {
      const start = m.index ?? 0;
      const prevEnd = i > 0 ? (matches[i - 1]!.index ?? 0) + matches[i - 1]![0].length : 0;
      const nextStart = i < matches.length - 1 ? (matches[i + 1]!.index ?? seg.length) : seg.length;
      const pre = seg.slice(prevEnd, start).toLowerCase();
      let post = seg.slice(start + m[0].length, nextStart).toLowerCase();
      // El rótulo del valor siguiente ("Standby:", "With 24 VDC:") no califica a este.
      const cut = post.search(/\b(standby|stand-by|idle|max(imum)?\.?\s*poe|no\s*poe|with\b[^:]*|full mesh[^:]*)\s*:/);
      if (cut >= 0) post = post.slice(0, cut);
      let value = num(m[1]!);
      if (/^m/i.test(m[2] ?? "")) value /= 1000;
      if (!Number.isFinite(value) || value <= 0) return;
      let basis: PowerBasis | null = labelBasis;
      if (/idle|standby|stand-by|power saver|sleep|reposo/.test(post)) return;
      if (/1\/8/.test(post)) basis = "1/8";
      else if (/typ/.test(post)) basis = "typical";
      else if (/max/.test(post)) basis = "max";
      else if (/max(imum)?\.?\s*poe|poe\s*budget/.test(pre)) return;
      else if (/no\s*poe|without\s*poe|sin\s*poe/.test(pre)) basis = "no-poe";
      else if (/idle|standby|stand-by|reposo/.test(pre)) return;
      out.push({ value, basis: basis ?? "plain", evidence: seg.trim().slice(0, 140) });
    });
  }
  return out;
}

const WATT_UNIT = /(\d+(?:[.,]\d+)?)\s*(mW|W|watts?)\b/gi;
const BTU_UNIT = /(\d+(?:[.,]\d+)?)\s*(BTU)/gi;
const BARE_NUMBER = /(\d+(?:[.,]\d+)?)()/g;

/** Orden de preferencia de la condición: amplificadores a 1/8; el resto, típico. */
const PREFERENCE: Record<"amp" | "other", PowerBasis[]> = {
  amp: ["1/8", "typical", "plain", "no-poe", "max"],
  other: ["typical", "no-poe", "plain", "1/8", "max"],
};

function best(hits: Hit[], amp: boolean): Hit | null {
  for (const b of PREFERENCE[amp ? "amp" : "other"]) {
    const h = hits.find((x) => x.basis === b);
    if (h) return h;
  }
  return null;
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Consumo de la ficha (W), con su condición; null si la ficha no lo trae. */
export function powerFromSpecs(specs: SpecRow[] | null | undefined, opts: { amp?: boolean } = {}): PowerReading | null {
  const rows = (specs ?? []).map((s) => ({ label: str(s.label) || str(s.labelEs), value: str(s.value) || str(s.valueEs) }));
  const power: Hit[] = [];
  const heat: Hit[] = [];
  for (const r of rows) {
    const label = r.label.trim();
    if (POWER_LABEL.test(label) && !SKIP_LABEL.test(label)) {
      const labelBasis: PowerBasis | null = /without poe|sin poe/i.test(label) ? "no-poe" : /\(max/i.test(label) || /max\)/i.test(label) ? "max" : null;
      power.push(...hitsOf(r.value, WATT_UNIT, labelBasis));
    } else if (HEAT_LABEL.test(label)) {
      // "BTU/h: 22.5" trae el número solo; "Heat Dissipation" trae la unidad.
      heat.push(...hitsOf(r.value, /btu/i.test(r.value) ? BTU_UNIT : BARE_NUMBER, null));
    }
  }
  const p = best(power, Boolean(opts.amp));
  if (p) return { watts: round1(p.value), basis: p.basis!, fromHeat: false, evidence: p.evidence };
  const h = best(heat, Boolean(opts.amp));
  if (h) return { watts: round1(h.value / BTU_PER_W), basis: h.basis!, fromHeat: true, evidence: h.evidence };
  return null;
}

/** Calor declarado en la ficha (BTU/h), si lo trae: vale más que W × 3,412 en amplificadores (parte de la potencia sale a los parlantes). */
export function heatFromSpecs(specs: SpecRow[] | null | undefined, opts: { amp?: boolean } = {}): number | null {
  const heat: Hit[] = [];
  for (const s of specs ?? []) {
    const label = (str(s.label) || str(s.labelEs)).trim();
    const value = str(s.value) || str(s.valueEs);
    if (HEAT_LABEL.test(label)) heat.push(...hitsOf(value, /btu/i.test(value) ? BTU_UNIT : BARE_NUMBER, null));
  }
  const h = best(heat, Boolean(opts.amp));
  return h ? Math.round(h.value) : null;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Consumo estimado sin ficha: amplificadores por su potencia de salida a 1/8; el resto, por tipo. */
export function estimatePower(cls: DeviceClass, ampTotalW: number | null): { watts: number; note: string } {
  if (cls === "amp") {
    if (ampTotalW && ampTotalW > 0) {
      const w = Math.round((ampTotalW / 8) / AMP_EFFICIENCY_EIGHTH + AMP_IDLE_W);
      return { watts: w, note: `Estimado: ${Math.round(ampTotalW)} W de salida a 1/8 con rendimiento ${Math.round(AMP_EFFICIENCY_EIGHTH * 100)} % + ${AMP_IDLE_W} W en reposo` };
    }
    return { watts: AMP_FALLBACK_W, note: "Estimado: amplificador sin potencia de salida en la ficha" };
  }
  return { watts: CLASS_ESTIMATE_W[cls] ?? DEFAULT_ESTIMATE_W, note: "Estimado por tipo de equipo (la ficha no trae consumo)" };
}

const BASIS_NOTE: Record<PowerBasis, string | null> = {
  "1/8": "a 1/8 de potencia",
  typical: "típico",
  "no-poe": "sin cargas PoE",
  plain: null,
  max: "máximo",
};

export type DevicePower = { watts: number; kind: PowerKind; note: string | null; heatBtu: number };

/** Consumo de un equipo: de la ficha si lo trae; si no, estimado. Y su calor (BTU/h). */
export function devicePower(input: { cls: DeviceClass; specs: SpecRow[] | null | undefined; ampTotalW: number | null }): DevicePower {
  const amp = input.cls === "amp";
  const reading = powerFromSpecs(input.specs, { amp });
  const heatFicha = heatFromSpecs(input.specs, { amp });
  if (reading) {
    const basis = BASIS_NOTE[reading.basis];
    const ampPlain = amp && reading.basis !== "1/8" ? "la ficha no aclara si es a 1/8 de potencia" : null;
    const note = [reading.fromHeat ? "deducido del calor de la ficha" : null, basis, ampPlain].filter(Boolean).join(" · ") || null;
    return { watts: reading.watts, kind: reading.fromHeat ? "ficha-calor" : "ficha", note, heatBtu: heatFicha ?? Math.round(reading.watts * BTU_PER_W) };
  }
  const est = estimatePower(input.cls, input.ampTotalW);
  return { watts: est.watts, kind: "estimado", note: est.note, heatBtu: heatFicha ?? Math.round(est.watts * BTU_PER_W) };
}

/** PDU sugerida: tomas (usadas + 25 % de reserva, mínimo 2 libres) y corriente nominal con carga continua ≤ 80 %. */
export function pduFor(outlets: number, amps: number): { outlets: number; amps: number | null; circuits: number; vertical: boolean } {
  const need = outlets + Math.max(2, Math.ceil(outlets * OUTLET_RESERVE));
  const size = PDU_OUTLETS.find((n) => n >= need) ?? Math.ceil(need / 2) * 2;
  const minAmps = amps / CONTINUOUS_LOAD;
  const rating = PDU_AMPS.find((a) => a >= minAmps) ?? null;
  // Más de 32 A no entra en un solo circuito: se reparte en circuitos de 20 A.
  const circuits = rating ? 1 : Math.ceil(minAmps / PDU_AMPS[2]);
  return { outlets: size, amps: rating ?? PDU_AMPS[2], circuits, vertical: size > 12 };
}

export type Ventilation = { level: "pasiva" | "forzada" | "climatizada"; cfm: number; text: string };

/** Ventilación recomendada para el calor dentro de un rack cerrado (criterio en PASSIVE_MAX_W / FORCED_MAX_W). */
export function ventilationFor(heatW: number): Ventilation {
  const cfm = Math.ceil((3.16 * heatW) / DELTA_T_F / 10) * 10;
  if (heatW <= PASSIVE_MAX_W) return { level: "pasiva", cfm, text: `Ventilación pasiva: tapas ventiladas arriba y abajo y panel ventilado sobre cada amplificador (≤ ${PASSIVE_MAX_W} W de calor en rack cerrado).` };
  if (heatW <= FORCED_MAX_W) return { level: "forzada", cfm, text: `Ventilación forzada: bandeja de ventiladores en el techo del rack extrayendo al menos ${cfm} CFM (calor de ${Math.round(heatW)} W, más de ${PASSIVE_MAX_W} W en rack cerrado).` };
  return { level: "climatizada", cfm, text: `Calor de ${Math.round(heatW)} W: ventilación forzada de al menos ${cfm} CFM y sala técnica climatizada (más de ${FORCED_MAX_W} W).` };
}

/** Consumo PoE de un equipo alimentado por el switch: el consumo declarado o el de su clase PoE. */
export function poeClassWatts(standard: string | null | undefined): { watts: number; estimated: boolean } {
  const s = (standard ?? "").toLowerCase();
  if (/802\.3bt|poe\+\+|upoe|type 4|class 8/.test(s)) return { watts: 60, estimated: true };
  // "802.3at Type 1" es compatible 802.3af (hasta 12,95 W en el equipo).
  if (/type 1|802\.3af|class [0-3]\b/.test(s)) return { watts: 12.95, estimated: true };
  if (/802\.3at|poe\+|class 4|type 2/.test(s)) return { watts: 25.5, estimated: true };
  return { watts: 12.95, estimated: true };
}
