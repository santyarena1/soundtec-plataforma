/**
 * Puertos de cada equipo para el cableado. Salen SOLO de la ficha del
 * fabricante (perfil de puertos con citas): un equipo sin ficha leída no tiene
 * puertos y no se cablea con suposiciones.
 */

import type { IoProfileData, IoSignal } from "./io-profile/types";
import type { SystemSpec } from "./system-specs";

export const SIGNALS = ["hdmi", "usb", "lan", "dante", "hdbaset", "speaker", "line", "rs232", "ir"] as const;
export type Signal = (typeof SIGNALS)[number];

/** Nombre corto y color de cada señal (planos, 3D y diagrama). */
export const SIGNAL_INFO: Record<Signal, { label: string; color: string }> = {
  hdmi: { label: "HDMI", color: "#e11d48" },
  usb: { label: "USB", color: "#16a34a" },
  lan: { label: "Red (UTP)", color: "#2563eb" },
  dante: { label: "Dante (UTP)", color: "#7c3aed" },
  hdbaset: { label: "HDBaseT (UTP)", color: "#0891b2" },
  speaker: { label: "Parlante", color: "#ea580c" },
  line: { label: "Audio de línea", color: "#ca8a04" },
  rs232: { label: "RS-232", color: "#64748b" },
  ir: { label: "IR", color: "#94a3b8" },
};

/** Clase de equipo para el cableado (qué papel cumple en el sistema). */
export type DeviceClass = "display" | "camera" | "mic" | "speaker" | "subwoofer" | "amp" | "dsp" | "codec" | "control" | "touch" | "switch" | "streamer" | "source" | "other";

export type PortGroup = { signal: Signal; count: number; label: string; /** Cita de la ficha. */ evidence?: string };
export type DevicePorts = {
  inputs: PortGroup[];
  outputs: PortGroup[];
  /** Puertos de red (control, Dante, PoE). */
  network: number;
  /** Consumo como dispositivo PoE (W), si se alimenta por PoE. */
  poeWatts?: number | null;
  /** El equipo da PoE (switch / inyector) y su presupuesto total (W). */
  poeSource?: boolean;
  poeBudgetWatts?: number | null;
  danteTx?: number | null;
  danteRx?: number | null;
  /** Línea de parlantes declarada: low-z | 70v | 100v | both. */
  lineVoltage?: string | null;
};

export type PortInput = {
  role: string;
  slotKey: string;
  name: string | null;
  spec: SystemSpec | null;
};

const DSP_NAME = /\bdsp\b|tesira|q-?sys|\bcore\b|\bbss\b|biamp|\bp300\b|intellimix|forte|\bdmp\b|soundweb|xilica|symetrix|ecler (mimo|vida)/i;
const CONTROL_NAME = /\bcp[34]n?\b|\bmc4\b|\bpro[34]\b|control processor|procesador de control|\brmc[34]\b|\bdin-ap\b|\bcontrol4\b|\bea-?\d|core one/i;
const SWITCH_NAME = /\bswitch\b|cen-sw|poe\+? switch|\bnetgear\b|cisco cbs|\bluxul\b/i;
const CODEC_NAME = /\bcodec\b|\bmtr\b|teams rooms|zoom rooms|room ?kit|\buc-?(engine|cx|c1)\b|\bpc\b|mini ?pc|\bnuc\b|\brally (bar|plus|system)\b|video ?bar|\bx30\b|\bx50\b|\bx70\b|\bstudio x\b|\bmeetup\b/i;
const VIDEOBAR_NAME = /video ?bar|\brally bar\b|\bx30\b|\bx50\b|\bstudio x\b|\bmeetup\b|\bbar (pro|mini)\b/i;

/** Qué papel cumple cada equipo en el sistema (rol en la sala + tipo de producto). */
export function deviceClass(input: PortInput): DeviceClass {
  const name = input.name ?? "";
  const kind = input.spec?.kind;
  if (kind === "amplifier") return "amp";
  if (kind === "switch" || SWITCH_NAME.test(name)) return "switch";
  if (kind === "streamer") return "streamer";
  switch (input.role) {
    case "display":
      return "display";
    case "camera":
      return VIDEOBAR_NAME.test(name) ? "codec" : "camera";
    case "mic":
      return "mic";
    case "speaker":
      return /sub(woofer)?\b/i.test(name) || input.slotKey.includes("sub") ? "subwoofer" : "speaker";
    case "touch":
      return "touch";
    case "codec":
      return "codec";
    case "processor":
      if (DSP_NAME.test(name)) return "dsp";
      if (CONTROL_NAME.test(name)) return "control";
      return CODEC_NAME.test(name) ? "codec" : "control";
    default:
      if (DSP_NAME.test(name)) return "dsp";
      if (CONTROL_NAME.test(name)) return "control";
      if (CODEC_NAME.test(name)) return "codec";
      return "other";
  }
}

/** Señal de la ficha → señal del cableado de sala (DisplayPort, SDI, relés… se muestran pero no se cablean solos). */
const IO_TO_SIGNAL: Partial<Record<IoSignal, Signal>> = {
  hdmi: "hdmi",
  "usb-a": "usb",
  "usb-b": "usb",
  "usb-c": "usb",
  hdbaset: "hdbaset",
  "analog-audio": "line",
  mic: "line",
  "digital-audio": "line",
  speaker: "speaker",
  rs232: "rs232",
  ir: "ir",
};

/** Puertos reales leídos de la ficha; null si el equipo no tiene ficha leída. */
export function devicePorts(io: IoProfileData | null | undefined): DevicePorts | null {
  if (!io || !io.ports.length) return null;
  const inputs: PortGroup[] = [];
  const outputs: PortGroup[] = [];
  let network = 0;
  for (const p of io.ports) {
    if (p.signal === "lan" || p.signal === "dante") {
      network += p.count;
      continue;
    }
    const signal = IO_TO_SIGNAL[p.signal];
    if (!signal) continue;
    const group = { signal, count: p.count, label: p.label, evidence: p.evidence };
    if (p.direction === "in" || p.direction === "bidir") inputs.push(group);
    if (p.direction === "out" || p.direction === "bidir") outputs.push(group);
  }
  const c = io.capabilities;
  const poeSource = io.ports.some((p) => p.poe === "pse");
  return {
    inputs,
    outputs,
    network,
    poeWatts: io.ports.some((p) => p.poe === "pd") ? (c.poeWatts?.value ?? null) : null,
    poeSource,
    poeBudgetWatts: poeSource ? (c.poeBudgetWatts?.value ?? null) : null,
    danteTx: c.danteTx?.value ?? null,
    danteRx: c.danteRx?.value ?? null,
    lineVoltage: c.lineVoltage?.value ?? null,
  };
}

/** Cuántos puertos de una señal tiene el equipo de un lado. */
export function portCount(ports: DevicePorts, side: "inputs" | "outputs", signal: Signal): number {
  if (signal === "lan" || signal === "dante") return ports.network;
  return ports[side].filter((p) => p.signal === signal).reduce((n, p) => n + p.count, 0);
}
