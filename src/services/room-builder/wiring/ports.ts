/**
 * Puertos individuales de un equipo: la ficha declara grupos ("HDMI IN 1-4",
 * 4 conectores) y acá se separan en puertos con nombre propio ("HDMI IN 1" …
 * "HDMI IN 4"), que es lo que se conecta en el plano técnico.
 */

import type { IoPort, IoSignal } from "../io-profile/types";
import { WIRE_SIGNAL_STYLE, type WirePort } from "./types";

/**
 * Rango numerado del rótulo: "HDMI IN 1-4" → { base: "HDMI IN", from: 1 },
 * "CH1-CH4" → { base: "CH", from: 1, joined: true }, "OUT 1-OUT 8" → "OUT" desde 1.
 */
function rangeOf(label: string): { base: string; from: number; joined: boolean } | null {
  const t = label.trim();
  const repeated = /^(.*?)(\s?)(\d+)\s*[-–]\s*\1\s?(\d+)\s*$/.exec(t);
  if (repeated) return { base: repeated[1]!.trim(), from: Number(repeated[3]), joined: !repeated[2] };
  const m = /^(.*?)(\s?)(\d+)\s*[-–a]\s*(\d+)\s*$/.exec(t);
  if (!m) return null;
  return { base: m[1]!.trim(), from: Number(m[3]), joined: !m[2] && m[1]!.length > 0 };
}

/** Puertos individuales a partir de los grupos de la ficha, con ids estables. */
export function expandIoPorts(groups: IoPort[]): WirePort[] {
  const out: WirePort[] = [];
  const used = new Set<string>();
  for (const g of groups) {
    const n = Math.max(1, Math.round(g.count || 1));
    const range = rangeOf(g.label);
    for (let i = 0; i < n; i++) {
      const label = range ? `${range.base}${range.joined ? "" : " "}${range.from + i}`.trim() : n > 1 ? `${g.label.trim()} ${i + 1}` : g.label.trim() || WIRE_SIGNAL_STYLE[g.signal].label;
      let id = `${g.direction}:${g.signal}:${i + 1}`;
      for (let k = 2; used.has(id); k++) id = `${g.direction}:${g.signal}:${i + 1}-${k}`;
      used.add(id);
      out.push({ id, signal: g.signal, direction: g.direction, label, connector: g.connector, source: "datasheet" });
    }
  }
  return out;
}

/** Puertos de un equipo genérico o sin ficha a partir de las señales que admite (una de cada). */
export function portsFromSignals(signals: Array<{ signal: IoSignal; direction: "in" | "out" | "bidir"; count?: number }>): WirePort[] {
  return signals.flatMap((s) =>
    Array.from({ length: Math.max(1, s.count ?? 1) }, (_, i) => ({
      id: `${s.direction}:${s.signal}:${i + 1}`,
      signal: s.signal,
      direction: s.direction,
      label: `${WIRE_SIGNAL_STYLE[s.signal].label}${s.direction === "in" ? " IN" : s.direction === "out" ? " OUT" : ""}${(s.count ?? 1) > 1 ? ` ${i + 1}` : ""}`,
      connector: null,
      source: "generic" as const,
    })),
  );
}

/** Señales que se pueden conectar entre sí (mismo cable físico). */
const FAMILY: Partial<Record<IoSignal, string>> = {
  "usb-a": "usb",
  "usb-b": "usb",
  "usb-c": "usb",
  lan: "net",
  dante: "net",
  "analog-audio": "audio",
  mic: "audio",
};
export const signalFamily = (s: IoSignal) => FAMILY[s] ?? s;
export const signalsCompatible = (a: IoSignal, b: IoSignal) => signalFamily(a) === signalFamily(b);
