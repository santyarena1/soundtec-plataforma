/**
 * Reglas de un cable del plano técnico, como las revisa un integrador:
 * misma señal en las dos puntas, sentido correcto (una salida a una entrada),
 * puerto libre y largo dentro de lo que admite la señal.
 */

import { cableLengthM, isPatchIo, UTP_MAX_M } from "../cable-length";
import type { IoSignal } from "../io-profile/types";
import { signalsCompatible } from "./ports";
import { speakerLoadIssues, type ElectricalOf, type SpeakerLoadOptions } from "./speaker-load";
import type { Wire, WirePoint, WirePort } from "./types";

export type WireIssue = { wireId: string; level: "error" | "warn"; text: string };

/** Largo máximo práctico por señal (m, sobre el largo TOTAL del cable), sin extensor. */
export const MAX_RUN_M: Partial<Record<IoSignal, number>> = {
  hdmi: 10,
  displayport: 5,
  "usb-a": 5,
  "usb-b": 5,
  "usb-c": 5,
  hdbaset: UTP_MAX_M,
  lan: UTP_MAX_M,
  dante: UTP_MAX_M,
  vga: 15,
  rs232: 15,
  sdi: 100,
};
/** Pasarse en UTP no se arregla con otro cable: es error (igual que el motor automático). */
const HARD_LIMIT: Partial<Record<IoSignal, true>> = { lan: true, dante: true, hdbaset: true };

/** Salidas que admiten varios cables (parlantes en paralelo / línea de 70 V). */
const SHARED_OUTPUT: Partial<Record<IoSignal, true>> = { speaker: true };

export type PlacedEnd = { x: number; y: number; z: number };

/** Altura por la que corre el cable: cielorraso, salvo que las dos puntas estén bajas (piso / mesa / rack). */
const LOW_END_M = 1.3;
/**
 * Recorrido medido (m): bajada/subida en cada punta y tramos en planta por los
 * quiebres. Sin reservas: el largo a comprar sale de cableLengthM (cable-length.ts),
 * la misma fórmula que usa el motor automático.
 */
export function wireRunM(a: PlacedEnd, b: PlacedEnd, points: WirePoint[], heightM: number): number {
  const low = a.y < LOW_END_M && b.y < LOW_END_M;
  const runY = low ? 0 : Math.max(2, heightM - 0.05);
  const path = [{ x: a.x, z: a.z }, ...points, { x: b.x, z: b.z }];
  let flat = 0;
  for (let i = 1; i < path.length; i++) flat += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
  const vertical = Math.abs(runY - a.y) + Math.abs(runY - b.y);
  return Math.round((flat + vertical) * 100) / 100;
}

/** Largo final de un cable del plano técnico para su recorrido (armado: comercial; rollo: +10 %). */
export function wireLengthM(runM: number, signal: IoSignal): number {
  return cableLengthM(runM, !isPatchIo(signal));
}

/** Revisión de todos los cables contra los puertos de los equipos. */
export function validateWires(
  wires: Wire[],
  portsOf: (deviceId: string) => WirePort[] | null,
  lengthOf: (w: Wire) => number,
  /** Datos eléctricos de cada equipo (ficha): con ellos se controla la carga de las salidas de parlante. */
  electricalOf?: ElectricalOf,
  speakerOptions?: SpeakerLoadOptions,
): WireIssue[] {
  const issues: WireIssue[] = electricalOf ? speakerLoadIssues(wires, portsOf, electricalOf, speakerOptions) : [];
  const used = new Map<string, string>();
  for (const w of wires) {
    const a = portsOf(w.from.deviceId)?.find((p) => p.id === w.from.portId) ?? null;
    const b = portsOf(w.to.deviceId)?.find((p) => p.id === w.to.portId) ?? null;
    if (!a || !b) {
      issues.push({ wireId: w.id, level: "error", text: `${!a ? "El puerto de origen" : "El puerto de destino"} ya no existe en el equipo.` });
      continue;
    }
    if (!signalsCompatible(a.signal, b.signal)) issues.push({ wireId: w.id, level: "error", text: `Señales distintas: ${a.label} y ${b.label}.` });
    if (a.direction === "in" && b.direction === "in") issues.push({ wireId: w.id, level: "error", text: `Dos entradas conectadas entre sí (${a.label} → ${b.label}).` });
    if (a.direction === "out" && b.direction === "out") issues.push({ wireId: w.id, level: "error", text: `Dos salidas conectadas entre sí (${a.label} → ${b.label}).` });
    for (const [end, port] of [
      [w.from, a],
      [w.to, b],
    ] as const) {
      const key = `${end.deviceId}#${end.unit}#${end.portId}`;
      const other = used.get(key);
      if (other && !(SHARED_OUTPUT[port.signal] && port.direction !== "in")) issues.push({ wireId: w.id, level: "error", text: `${port.label} ya está usado por otro cable.` });
      used.set(key, w.id);
    }
    const max = MAX_RUN_M[a.signal];
    const len = lengthOf(w);
    if (max && len > max)
      issues.push(
        HARD_LIMIT[a.signal]
          ? { wireId: w.id, level: "error", text: `${len} m supera el canal UTP de ${max} m: hace falta un switch intermedio o fibra.` }
          : { wireId: w.id, level: "warn", text: `${len} m supera lo que admite ${a.label} (${max} m): usar extensor o HDBaseT.` },
      );
  }
  return issues;
}
