/**
 * Reglas de un cable del plano técnico, como las revisa un integrador:
 * misma señal en las dos puntas, sentido correcto (una salida a una entrada),
 * puerto libre y largo dentro de lo que admite la señal.
 */

import type { IoSignal } from "../io-profile/types";
import { signalsCompatible } from "./ports";
import type { Wire, WirePoint, WirePort } from "./types";

export type WireIssue = { wireId: string; level: "error" | "warn"; text: string };

/** Largo máximo práctico por señal (m), sin extensor. */
export const MAX_RUN_M: Partial<Record<IoSignal, number>> = {
  hdmi: 10,
  displayport: 5,
  "usb-a": 5,
  "usb-b": 5,
  "usb-c": 5,
  hdbaset: 100,
  lan: 100,
  dante: 100,
  vga: 15,
  rs232: 15,
  sdi: 100,
};

/** Salidas que admiten varios cables (parlantes en paralelo / línea de 70 V). */
const SHARED_OUTPUT: Partial<Record<IoSignal, true>> = { speaker: true };

export type PlacedEnd = { x: number; y: number; z: number };

/** Altura por la que corre el cable: cielorraso, salvo que las dos puntas estén bajas (piso / mesa / rack). */
const LOW_END_M = 1.3;
/** Reserva por punta para terminar el cable (m) y reserva general (fracción). */
const TERMINATION_M = 0.3;
const SLACK = 0.1;

/** Largo del recorrido: subida, tramos en planta por los quiebres, bajada, terminaciones y reserva. */
export function wireRunM(a: PlacedEnd, b: PlacedEnd, points: WirePoint[], heightM: number): number {
  const low = a.y < LOW_END_M && b.y < LOW_END_M;
  const runY = low ? 0 : Math.max(2, heightM - 0.05);
  const path = [{ x: a.x, z: a.z }, ...points, { x: b.x, z: b.z }];
  let flat = 0;
  for (let i = 1; i < path.length; i++) flat += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
  const vertical = Math.abs(runY - a.y) + Math.abs(runY - b.y);
  return Math.round((flat + vertical + TERMINATION_M * 2) * (1 + SLACK) * 10) / 10;
}

/** Revisión de todos los cables contra los puertos de los equipos. */
export function validateWires(
  wires: Wire[],
  portsOf: (deviceId: string) => WirePort[] | null,
  lengthOf: (w: Wire) => number,
): WireIssue[] {
  const issues: WireIssue[] = [];
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
    if (max && len > max) issues.push({ wireId: w.id, level: "warn", text: `${len} m supera lo que admite ${a.label} (${max} m): usar extensor o HDBaseT.` });
  }
  return issues;
}
