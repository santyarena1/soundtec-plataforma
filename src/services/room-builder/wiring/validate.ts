/**
 * Reglas de un cable del plano técnico, como las revisa un integrador:
 * misma señal en las dos puntas (y el mismo nivel de audio / formato digital /
 * familia de enlace propietario), sentido correcto (una salida a una entrada),
 * puerto libre y largo dentro de lo que admite la señal según las fichas
 * (signal-reach.ts: resolución del HDMI, versión de USB, HDBaseT 4K o 1080p).
 */

import { cableLengthM, isPatchIo } from "../cable-length";
import type { IoSignal } from "../io-profile/types";
import { reachFor, remedyFor, type ReachCatalog, type ReachEnd } from "../signal-reach";
import { portsMismatch } from "./ports";
import { speakerLoadIssues, type ElectricalOf, type SpeakerLoadOptions } from "./speaker-load";
import type { Wire, WirePoint, WirePort } from "./types";

export type WireIssue = { wireId: string; level: "error" | "warn"; text: string };

/**
 * Largo máximo práctico por señal sin datos de ficha (m, sobre el largo TOTAL del cable):
 * los mismos que signal-reach.ts toma por defecto (HDMI a 4K60, USB 2.0, HDBaseT 4K en Cat6).
 */
export const MAX_RUN_M: Partial<Record<IoSignal, number>> = Object.fromEntries(
  (["hdmi", "displayport", "usb-a", "usb-b", "usb-c", "hdbaset", "lan", "dante", "vga", "rs232", "sdi"] as IoSignal[]).map((s) => [s, reachFor(s)!.maxM]),
);

/** Lo que dicen las fichas de las dos puntas de un cable (resolución, USB, largo del puerto). */
export type ReachOf = (w: Wire) => { from: ReachEnd; to: ReachEnd } | null;

/** Salidas que admiten varios cables (parlantes en paralelo / línea de 70 V). */
const SHARED_OUTPUT: Partial<Record<IoSignal, true>> = { speaker: true };

export type PlacedEnd = { x: number; y: number; z: number };

/** Altura por la que corre el cable: cielorraso, salvo que las dos puntas estén bajas (piso / mesa / rack). */
const LOW_END_M = 1.3;
/** Equipos a menos de esto en planta (receptor o códec detrás de la pantalla): el cable va directo (igual que cabling.ts). */
const DIRECT_RUN_M = 1.5;
/**
 * Recorrido medido (m): bajada/subida en cada punta y tramos en planta por los
 * quiebres. Sin reservas: el largo a comprar sale de cableLengthM (cable-length.ts),
 * la misma fórmula que usa el motor automático.
 */
export function wireRunM(a: PlacedEnd, b: PlacedEnd, points: WirePoint[], heightM: number): number {
  const path = [{ x: a.x, z: a.z }, ...points, { x: b.x, z: b.z }];
  let flat = 0;
  for (let i = 1; i < path.length; i++) flat += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
  // Tramo corto por detrás de los equipos: la diferencia de altura y la planta, sin subir al cielorraso.
  if (flat < DIRECT_RUN_M) return Math.round((flat + Math.abs(a.y - b.y)) * 100) / 100;
  const low = a.y < LOW_END_M && b.y < LOW_END_M;
  const runY = low ? 0 : Math.max(2, heightM - 0.05);
  const vertical = Math.abs(runY - a.y) + Math.abs(runY - b.y);
  return Math.round((flat + vertical) * 100) / 100;
}

/** Largo final de un cable del plano técnico para su recorrido (armado: comercial; rollo: +10 %). */
export function wireLengthM(runM: number, signal: IoSignal): number {
  return cableLengthM(runM, !isPatchIo(signal));
}

/** Largo máximo de un cable según las fichas de sus puntas (null: la señal no tiene tope). */
export function wireMaxM(w: Wire, reachOf?: ReachOf): number | null {
  const ends = reachOf?.(w);
  return reachFor(w.signal, ends?.from, ends?.to)?.maxM ?? null;
}

export type ValidateOptions = {
  /** Fichas de las puntas de cada cable: con ellas el largo máximo sale de la resolución / USB / HDBaseT reales. */
  reachOf?: ReachOf;
  /** Productos del catálogo que resuelven tramos largos (para nombrarlos). */
  remedies?: ReachCatalog;
};

/** Revisión de todos los cables contra los puertos de los equipos. */
export function validateWires(
  wires: Wire[],
  portsOf: (deviceId: string) => WirePort[] | null,
  lengthOf: (w: Wire) => number,
  /** Datos eléctricos de cada equipo (ficha): con ellos se controla la carga de las salidas de parlante. */
  electricalOf?: ElectricalOf,
  speakerOptions?: SpeakerLoadOptions,
  options: ValidateOptions = {},
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
    // Señal, nivel de audio, formato digital y familia de enlace, mirando de la salida a la entrada.
    const [out, input] = a.direction === "in" && b.direction !== "in" ? [b, a] : [a, b];
    const mismatch = portsMismatch(out, input);
    if (mismatch) issues.push({ wireId: w.id, level: "error", text: mismatch });
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
    lengthIssue(w, a, b, lengthOf(w), options, issues);
  }
  return issues;
}

/** Largo contra el alcance de la señal: aviso con la solución concreta (en UTP, error). */
function lengthIssue(w: Wire, a: WirePort, b: WirePort, len: number, options: ValidateOptions, issues: WireIssue[]): void {
  const ends = options.reachOf?.(w);
  const withPort = (e: ReachEnd | undefined, p: WirePort): ReachEnd => ({ ...e, portMaxM: e?.portMaxM ?? p.maxLengthM ?? null, portText: e?.portText ?? `${p.label} ${p.evidence ?? ""}` });
  const reach = reachFor(a.signal, withPort(ends?.from, a), withPort(ends?.to, b));
  if (!reach) return;
  if (len > reach.maxM) {
    const fix = remedyFor(reach, len, options.remedies).text;
    issues.push(
      reach.hard
        ? { wireId: w.id, level: "error", text: `${len} m supera el alcance (${reach.basis}: ${reach.maxM} m): ${fix}` }
        : { wireId: w.id, level: "warn", text: `${len} m supera lo que admite ${a.label} (${reach.basis}: ${reach.maxM} m): ${fix}` },
    );
  } else if (len > reach.warnFromM) {
    issues.push({ wireId: w.id, level: "warn", text: `${len} m está al límite (${reach.basis}: hasta ${reach.maxM} m, aviso desde ${reach.warnFromM} m): cable certificado y prueba en obra.` });
  }
}
