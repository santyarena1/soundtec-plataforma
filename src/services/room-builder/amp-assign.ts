/**
 * Reparto de los parlantes pasivos en los canales de los amplificadores por
 * carga real: en baja impedancia, el paralelo de las impedancias de cada
 * canal no baja de la carga mínima del amplificador; en 70/100 V, la suma de
 * taps de la línea no pasa del 80 % de la potencia del canal (o del par de
 * canales si la línea va puenteada). Nunca se mezclan los dos modos en una
 * misma salida. Los datos que no vienen de la ficha quedan como estimados.
 */

import {
  ampLineCapacity,
  ampMinLoad,
  chooseTap,
  fitsHighZ,
  fitsLowZ,
  lineModes,
  parallelOhms,
  productLabel,
  pickLineVolts,
  speakerLineVolts,
  speakerOhms,
  targetTapW,
  type Estimate,
  type LineVolts,
  type SpeakerMode,
} from "./amp-load";
import type { DevicePorts } from "./device-ports";

export type AmpUnit = { id: string; label: string; ports: DevicePorts; /** Números reales de los canales que puede usar la sala. */ channels: number[] };
export type SpeakerUnit = { id: string; label: string; ports: DevicePorts };

/** Cómo quedó cargado cada canal usado. */
export type ChannelLoad = {
  ampId: string;
  ampLabel: string;
  channel: number;
  /** Canal que se suma puenteado (línea de 70/100 V que ocupa un par). */
  partner: number | null;
  mode: SpeakerMode;
  volts: LineVolts | null;
  speakerIds: string[];
  /** Baja impedancia: carga del canal (paralelo) y carga mínima del amplificador (Ω). */
  loadOhms: number | null;
  minLoadOhms: number | null;
  /** 70/100 V: taps de cada parlante, suma y potencia del canal (W); uso sobre el total (%). */
  taps: number[];
  tapW: number;
  capacityW: number | null;
  usePct: number | null;
};

export type Placement = { speakerId: string; ampId: string; channel: number; partner: number | null; mode: SpeakerMode; volts: LineVolts | null; tapW: number | null };

export type AssignResult = {
  placements: Placement[];
  channels: ChannelLoad[];
  /** Parlantes sin ningún amplificador de su modo (baja impedancia / línea). */
  incompatible: Array<{ speakerId: string; lowZ: boolean }>;
  /** Parlantes que no entran: por carga mínima (low) o por potencia de línea (high). */
  short: Record<SpeakerMode, string[]>;
  estimates: Estimate[];
};

export type AssignOptions = { category?: string | null; tapW?: number | null };

type Ch = {
  amp: AmpUnit;
  idx: number;
  ch: number;
  partner: number | null;
  /** Ocupado como segundo canal de un par puenteado. */
  busy: boolean;
  mode: SpeakerMode | null;
  volts: LineVolts | null;
  capW: number | null;
  bridged: boolean;
  ohms: number[];
  taps: number[];
  speakers: string[];
};

type Fit = { volts: LineVolts | null; ohms: number | null; tap: number | null; capW: number | null; bridged: boolean; estimates: Array<Estimate | null> };

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function assignSpeakers(amps: AmpUnit[], speakers: SpeakerUnit[], opts: AssignOptions = {}): AssignResult {
  const chans: Ch[] = amps.flatMap((amp) => amp.channels.map((ch, idx) => ({ amp, idx, ch, partner: null, busy: false, mode: null, volts: null, capW: null, bridged: false, ohms: [], taps: [], speakers: [] })));
  const target = targetTapW(opts.category, opts.tapW);
  const minLoad = new Map(amps.map((a) => [a.id, ampMinLoad(a.ports, a.label)]));
  const next = (c: Ch) => chans.find((x) => x.amp === c.amp && x.idx === c.idx + 1) ?? null;
  const estimates = new Map<string, Estimate>();
  const result: AssignResult = { placements: [], channels: [], incompatible: [], short: { low: [], high: [] }, estimates: [] };

  const tryFit = (c: Ch, m: SpeakerMode, spk: SpeakerUnit): Fit | null => {
    if (c.busy || !lineModes(c.amp.ports.lineVoltage).includes(m) || (c.mode != null && c.mode !== m)) return null;
    if (m === "low") {
      const z = speakerOhms(spk.ports, productLabel(spk.label));
      const min = minLoad.get(c.amp.id)!;
      return fitsLowZ(c.ohms, z.ohms, min.ohms) ? { volts: null, ohms: z.ohms, tap: null, capW: null, bridged: false, estimates: [z.estimate, min.estimate] } : null;
    }
    const volts = c.volts ?? pickLineVolts(c.amp.ports, spk.ports);
    if (!volts || !speakerLineVolts(spk.ports).includes(volts)) return null;
    const cap = c.mode ? { watts: c.capW, bridged: c.bridged, estimate: null } : ampLineCapacity(c.amp.ports, volts, c.amp.label);
    // Línea puenteada: arranca en el primer canal de un par con los dos libres.
    if (c.mode == null && cap.bridged) {
      const n = next(c);
      if (c.idx % 2 !== 0 || !n || n.busy || n.mode != null) return null;
    }
    const tap = chooseTap(spk.ports, volts, target, productLabel(spk.label));
    return fitsHighZ(sum(c.taps), tap.watts, cap.watts) ? { volts, ohms: null, tap: tap.watts, capW: cap.watts, bridged: cap.bridged, estimates: [cap.estimate, tap.estimate] } : null;
  };

  for (const spk of speakers) {
    const spkModes = lineModes(spk.ports.lineVoltage, "high");
    // Se llena un amplificador antes de abrir otro y, dentro de él, se reparte entre canales.
    const inUse = (a: AmpUnit) => chans.some((x) => x.amp === a && x.speakers.length > 0);
    let pick: { c: Ch; m: SpeakerMode; fit: Fit } | null = null;
    for (const m of spkModes) {
      const options = chans
        .map((c) => ({ c, fit: tryFit(c, m, spk) }))
        .filter((x): x is { c: Ch; fit: Fit } => x.fit != null)
        .sort((a, b) => Number(b.c.mode === m) - Number(a.c.mode === m) || Number(inUse(b.c.amp)) - Number(inUse(a.c.amp)) || a.c.speakers.length - b.c.speakers.length);
      if (options[0]) {
        pick = { ...options[0], m };
        break;
      }
    }
    if (!pick) {
      const possible = spkModes.filter((m) => chans.some((c) => lineModes(c.amp.ports.lineVoltage).includes(m)));
      if (!possible.length) result.incompatible.push({ speakerId: spk.id, lowZ: !spkModes.includes("high") });
      else result.short[possible[0]!].push(spk.id);
      continue;
    }
    const { c, m, fit } = pick;
    if (c.mode == null && m === "high") {
      c.volts = fit.volts;
      c.capW = fit.capW;
      c.bridged = fit.bridged;
      if (fit.bridged) {
        const n = next(c)!;
        n.busy = true;
        n.mode = "high";
        c.partner = n.ch;
      }
    }
    c.mode = m;
    c.speakers.push(spk.id);
    if (fit.ohms != null) c.ohms.push(fit.ohms);
    if (fit.tap != null) c.taps.push(fit.tap);
    for (const e of fit.estimates) if (e) estimates.set(e.text, e);
    result.placements.push({ speakerId: spk.id, ampId: c.amp.id, channel: c.ch, partner: c.partner, mode: m, volts: c.volts, tapW: fit.tap });
  }

  result.channels = chans
    .filter((c) => c.speakers.length > 0)
    .map((c) => {
      const tapW = sum(c.taps);
      return {
        ampId: c.amp.id,
        ampLabel: c.amp.label,
        channel: c.ch,
        partner: c.partner,
        mode: c.mode!,
        volts: c.volts,
        speakerIds: c.speakers,
        loadOhms: c.mode === "low" ? Math.round(parallelOhms(c.ohms) * 100) / 100 : null,
        minLoadOhms: c.mode === "low" ? minLoad.get(c.amp.id)!.ohms : null,
        taps: c.taps,
        tapW,
        capacityW: c.mode === "high" ? c.capW : null,
        usePct: c.mode === "high" && c.capW ? Math.round((tapW / c.capW) * 100) : null,
      };
    });
  result.estimates = [...estimates.values()];
  return result;
}
