/**
 * Carga eléctrica de la amplificación, como la calcula un integrador:
 * impedancia en paralelo por canal contra la carga mínima del amplificador,
 * suma de taps por línea de 70/100 V contra el 80 % de la potencia del canal,
 * y calibre del cable de parlante por pérdida (< 0,5 dB).
 *
 * Los datos salen de la ficha (DevicePorts). Si falta uno, se usa un valor
 * típico SOLO para poder seguir y se devuelve el aviso "dato estimado: …"
 * para que quede visible qué no está verificado.
 */

import type { DevicePorts } from "./device-ports";

export type LineVolts = "70V" | "100V";
export type SpeakerMode = "low" | "high";

/** Dato que no salió de la ficha ni del usuario: missing = faltaba; default = elegido por defecto. */
export type Estimate = { kind: "missing" | "default"; text: string };

/** Resistividad del cobre (Ω·mm²/m). */
export const COPPER_OHM_MM2_PER_M = 0.0172;
/** Pérdida máxima del cable: resistencia del lazo ≤ 6 % de la carga (≈ 0,5 dB). */
export const MAX_CABLE_LOSS_RATIO = 0.06;
/** En 70/100 V la suma de taps no pasa del 80 % de la potencia del canal. */
export const HIGHZ_MAX_LOAD_RATIO = 0.8;
/** Valores típicos para poder seguir cuando falta el dato (siempre con aviso). */
export const TYPICAL_SPEAKER_OHMS = 8;
export const TYPICAL_MIN_LOAD_OHMS = 4;
/** Tap por defecto (W por parlante en línea) según el tipo de sala; el usuario lo puede fijar. */
export const DEFAULT_TAP_W = 5;
export const DEFAULT_TAP_W_BY_CATEGORY: Record<string, number> = { lobby: 7.5, commercial: 7.5, event: 15 };

/** Calibres comerciales de cable de parlante (mm²) con su equivalente AWG. */
export const SPEAKER_GAUGES: ReadonlyArray<{ mm2: number; awg: number }> = [
  { mm2: 0.75, awg: 18 },
  { mm2: 1, awg: 17 },
  { mm2: 1.5, awg: 16 },
  { mm2: 2.5, awg: 14 },
  { mm2: 4, awg: 12 },
  { mm2: 6, awg: 10 },
];
/** Calibre mínimo práctico: baja impedancia arranca en 1,5 mm²; en línea de tensión se admite 0,75 mm². */
const MIN_GAUGE_MM2: Record<SpeakerMode, number> = { low: 1.5, high: 0.75 };

const VOLTS: Record<LineVolts, number> = { "70V": 70, "100V": 100 };
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Rótulo del producto sin el número de unidad ("Parlante X (3)" → "Parlante X"): un aviso por producto, no por unidad. */
export const productLabel = (label: string) => label.replace(/\s\(\d+\)$/, "");

/** Clave de potencia de la ficha ("8Ω", "4 ohm", "8", "70V") → carga en Ω o tensión de línea. */
export function parseLoadKey(key: string): { ohms: number } | { volts: LineVolts } | null {
  const k = key.replace(/\s+/g, "").toLowerCase();
  const v = /^(70|100)v$/.exec(k);
  if (v) return { volts: `${v[1]}V` as LineVolts };
  const o = /^(\d+(?:[.,]\d+)?)(ω|Ω|ohms?)?$/i.exec(k);
  return o ? { ohms: Number(o[1]!.replace(",", ".")) } : null;
}

/** Potencias de la ficha por carga en Ω (ordenadas de menor a mayor carga). */
function ratedByOhms(map: Record<string, number> | null | undefined): Array<{ ohms: number; watts: number }> {
  return Object.entries(map ?? {})
    .map(([k, w]) => ({ key: parseLoadKey(k), watts: Number(w) }))
    .filter((x): x is { key: { ohms: number }; watts: number } => Boolean(x.key && "ohms" in x.key) && Number.isFinite(x.watts) && x.watts > 0)
    .map((x) => ({ ohms: x.key.ohms, watts: x.watts }))
    .sort((a, b) => a.ohms - b.ohms);
}

function wattsAtVolts(map: Record<string, number> | null | undefined, volts: LineVolts): number | null {
  for (const [k, w] of Object.entries(map ?? {})) {
    const key = parseLoadKey(k);
    if (key && "volts" in key && key.volts === volts && Number(w) > 0) return Number(w);
  }
  return null;
}

/**
 * Carga mínima por canal: la de la ficha; si no está, 4 Ω si la ficha da potencia a 4 Ω (o menos);
 * si solo da potencia a cargas mayores, la menor de ellas; sin datos, 4 Ω típico. Fuera de la ficha, siempre con aviso.
 */
export function ampMinLoad(amp: DevicePorts, label: string): { ohms: number; estimate: Estimate | null } {
  if (amp.minLoadOhms != null && amp.minLoadOhms > 0) return { ohms: amp.minLoadOhms, estimate: null };
  const rated = ratedByOhms(amp.ampWattsPerChannel);
  if (rated.some((r) => r.ohms <= TYPICAL_MIN_LOAD_OHMS)) {
    return { ohms: TYPICAL_MIN_LOAD_OHMS, estimate: { kind: "missing", text: `carga mínima de ${label}: ${TYPICAL_MIN_LOAD_OHMS} Ω (la ficha da potencia a ${TYPICAL_MIN_LOAD_OHMS} Ω pero no declara la carga mínima)` } };
  }
  if (rated.length) {
    return { ohms: rated[0]!.ohms, estimate: { kind: "missing", text: `carga mínima de ${label}: ${fmt(rated[0]!.ohms)} Ω (la menor carga con potencia en la ficha)` } };
  }
  return { ohms: TYPICAL_MIN_LOAD_OHMS, estimate: { kind: "missing", text: `carga mínima de ${label}: ${TYPICAL_MIN_LOAD_OHMS} Ω típico (la ficha no la declara)` } };
}

/** Impedancia nominal del parlante: la de la ficha o 8 Ω típico (con aviso). */
export function speakerOhms(spk: DevicePorts, label: string): { ohms: number; estimate: Estimate | null } {
  if (spk.impedanceOhms != null && spk.impedanceOhms > 0) return { ohms: spk.impedanceOhms, estimate: null };
  return { ohms: TYPICAL_SPEAKER_OHMS, estimate: { kind: "missing", text: `impedancia de ${label}: ${TYPICAL_SPEAKER_OHMS} Ω típico (la ficha no la declara)` } };
}

/** Impedancia de cargas en paralelo (Ω). */
export function parallelOhms(list: number[]): number {
  const g = list.reduce((s, z) => s + (z > 0 ? 1 / z : 0), 0);
  return g > 0 ? 1 / g : Infinity;
}

/** ¿Entra un parlante más en el canal sin bajar de la carga mínima? */
export function fitsLowZ(current: number[], add: number, minLoad: number): boolean {
  return parallelOhms([...current, add]) >= minLoad - 1e-9;
}

/** ¿Entra un tap más en la línea sin pasar del 80 % del canal? Sin potencia conocida no se limita (ya se avisó). */
export function fitsHighZ(tapSum: number, add: number, capacityW: number | null): boolean {
  return capacityW == null || tapSum + add <= capacityW * HIGHZ_MAX_LOAD_RATIO + 1e-9;
}

/** Tensiones de línea que da el amplificador (según su ficha). */
export function ampLineVolts(amp: DevicePorts): LineVolts[] {
  const fromWatts = (["70V", "100V"] as const).filter((v) => wattsAtVolts(amp.ampWattsPerChannel, v) != null || wattsAtVolts(amp.ampBridgedWatts, v) != null);
  if (fromWatts.length) return fromWatts;
  if (amp.lineVoltage === "100v") return ["100V"];
  if (amp.lineVoltage === "70v") return ["70V"];
  return ["70V", "100V"];
}

/** Tensiones que admite el transformador del parlante (taps de la ficha o línea declarada). */
export function speakerLineVolts(spk: DevicePorts): LineVolts[] {
  const taps = (["70V", "100V"] as const).filter((v) => (spk.transformerTaps?.[v] ?? []).length > 0);
  if (taps.length) return taps;
  if (spk.lineVoltage === "100v") return ["100V"];
  if (spk.lineVoltage === "70v") return ["70V"];
  return ["70V", "100V"];
}

/** Tensión de la línea entre un amplificador y un parlante (null: no tienen una en común). */
export function pickLineVolts(amp: DevicePorts, spk: DevicePorts): LineVolts | null {
  const s = speakerLineVolts(spk);
  return ampLineVolts(amp).find((v) => s.includes(v)) ?? null;
}

/**
 * Potencia de un canal en línea de 70/100 V. Si la ficha la da solo puenteada, la línea ocupa un
 * par de canales. Sin el dato se usa la potencia a 8 Ω (con aviso) o no se limita (con aviso).
 */
export function ampLineCapacity(amp: DevicePorts, volts: LineVolts, label: string): { watts: number | null; bridged: boolean; estimate: Estimate | null } {
  const per = wattsAtVolts(amp.ampWattsPerChannel, volts);
  if (per != null) return { watts: per, bridged: false, estimate: null };
  const bridged = wattsAtVolts(amp.ampBridgedWatts, volts);
  if (bridged != null) return { watts: bridged, bridged: true, estimate: null };
  const at8 = ratedByOhms(amp.ampWattsPerChannel).find((r) => r.ohms === TYPICAL_SPEAKER_OHMS);
  if (at8) return { watts: at8.watts, bridged: false, estimate: { kind: "missing", text: `potencia en ${volts} de ${label}: ${at8.watts} W por canal (se usa la de 8 Ω; la ficha no da la de ${volts})` } };
  return { watts: null, bridged: false, estimate: { kind: "missing", text: `potencia en ${volts} de ${label}: la ficha no la declara, no se verificó el 80 % de la línea` } };
}

/** Tap objetivo por parlante: el del usuario o el típico del tipo de sala. */
export function targetTapW(category: string | null | undefined, userTapW?: number | null): { watts: number; fromUser: boolean } {
  if (userTapW != null && userTapW > 0) return { watts: userTapW, fromUser: true };
  return { watts: DEFAULT_TAP_W_BY_CATEGORY[category ?? ""] ?? DEFAULT_TAP_W, fromUser: false };
}

/**
 * Tap del transformador para un parlante: el menor que alcanza el objetivo (o el mayor que tenga).
 * Sin taps en la ficha se suma el objetivo como estimado; elegido por defecto (no por el usuario), queda marcado.
 */
export function chooseTap(spk: DevicePorts, volts: LineVolts, target: { watts: number; fromUser: boolean }, label: string): { watts: number; estimate: Estimate | null } {
  const taps = [...(spk.transformerTaps?.[volts] ?? [])].filter((t) => t > 0).sort((a, b) => a - b);
  if (!taps.length) return { watts: target.watts, estimate: { kind: "missing", text: `taps de ${label} en ${volts}: la ficha no los declara, se suman ${fmt(target.watts)} W` } };
  const watts = taps.find((t) => t >= target.watts - 1e-9) ?? taps[taps.length - 1]!;
  if (target.fromUser) return { watts, estimate: null };
  return { watts, estimate: { kind: "default", text: `tap de ${label}: ${fmt(watts)} W en ${volts} (por defecto según el tipo de sala)` } };
}

export type GaugePick = { mm2: number; awg: number; loopOhms: number; lossDb: number; enough: boolean; label: string };
export type GaugeLoad = { mode: "low"; ohms: number } | { mode: "high"; volts: LineVolts; watts: number };

/**
 * Calibre del cable de parlante para perder menos de 0,5 dB: resistencia del lazo (ida y vuelta,
 * cobre) ≤ 6 % de la carga. En baja impedancia la carga es la del canal; en 70/100 V es la
 * impedancia equivalente de la línea, Z = V² / P (P = suma de taps).
 */
export function speakerGauge(lengthM: number, load: GaugeLoad): GaugePick {
  const z = load.mode === "low" ? load.ohms : VOLTS[load.volts] ** 2 / Math.max(load.watts, 1e-6);
  const maxLoop = z * MAX_CABLE_LOSS_RATIO;
  const loop = (mm2: number) => (2 * Math.max(lengthM, 0) * COPPER_OHM_MM2_PER_M) / mm2;
  const options = SPEAKER_GAUGES.filter((g) => g.mm2 >= MIN_GAUGE_MM2[load.mode]);
  const pick = options.find((g) => loop(g.mm2) <= maxLoop) ?? options[options.length - 1]!;
  const r = loop(pick.mm2);
  const lossDb = Math.round(20 * Math.log10(z / (z + r)) * 100) / 100;
  const enough = r <= maxLoop + 1e-9;
  const line = load.mode === "high" ? ` — línea de ${load.volts}` : "";
  const warn = enough ? "" : ` — pierde ${fmt(-lossDb)} dB: acortar el tramo o partir la línea`;
  return { mm2: pick.mm2, awg: pick.awg, loopOhms: Math.round(r * 1000) / 1000, lossDb, enough, label: `Cable de parlante 2×${fmt(pick.mm2)} mm² (${pick.awg} AWG)${line}${warn}` };
}

/** Modos en que trabaja un equipo según su línea declarada (both: baja impedancia y 70/100 V). */
export function lineModes(lineVoltage: string | null | undefined, prefer: SpeakerMode = "low"): SpeakerMode[] {
  if (lineVoltage === "both") return prefer === "high" ? ["high", "low"] : ["low", "high"];
  return lineVoltage === "70v" || lineVoltage === "100v" ? ["high"] : ["low"];
}

/**
 * Canales que necesita un grupo de parlantes pasivos en un amplificador (reparto por carga real):
 * baja impedancia sin bajar de la carga mínima y 70/100 V sin pasar del 80 % (un par de canales si
 * la línea va puenteada). Sin amplificador conocido: 2 parlantes de 8 Ω por canal (4 Ω típico).
 */
export function channelsForSpeakers(speakers: Array<{ ports: DevicePorts | null; quantity: number }>, amp: DevicePorts | null, opts: { category?: string | null; tapW?: number | null } = {}): number {
  const ampPorts: DevicePorts = amp ?? { inputs: [], outputs: [], network: 0, lineVoltage: "low-z" };
  const min = ampMinLoad(ampPorts, "").ohms;
  const low: number[][] = [];
  const high = new Map<LineVolts, { lines: number[]; cap: number | null; width: number }>();
  const target = targetTapW(opts.category, opts.tapW);
  for (const s of speakers) {
    const ports = s.ports ?? { inputs: [], outputs: [], network: 0, lineVoltage: "low-z" };
    const ampModes = lineModes(ampPorts.lineVoltage);
    // Sin modo en común (se avisa en el cableado) se cuenta igual en el modo del parlante.
    const own = lineModes(ports.lineVoltage, "high");
    const mode = own.find((m) => ampModes.includes(m)) ?? own[0]!;
    for (let i = 0; i < Math.max(1, s.quantity); i++) {
      if (mode === "low") {
        const z = speakerOhms(ports, "").ohms;
        const ch = low.find((c) => fitsLowZ(c, z, min));
        if (ch) ch.push(z);
        else low.push([z]);
        continue;
      }
      const volts = pickLineVolts(ampPorts, ports) ?? "70V";
      const cap = ampLineCapacity(ampPorts, volts, "");
      const tap = chooseTap(ports, volts, target, "").watts;
      const g = high.get(volts) ?? { lines: [], cap: cap.watts, width: cap.bridged ? 2 : 1 };
      const k = g.lines.findIndex((sum) => fitsHighZ(sum, tap, g.cap));
      if (k >= 0) g.lines[k]! += tap;
      else g.lines.push(tap);
      high.set(volts, g);
    }
  }
  return low.length + [...high.values()].reduce((n, g) => n + g.lines.length * g.width, 0);
}
