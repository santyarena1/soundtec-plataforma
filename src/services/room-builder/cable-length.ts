/**
 * Largo de cable a comprar: UNA sola fórmula para el motor automático
 * (cabling.ts) y para el plano técnico (wiring/), así la cotización, la
 * planilla y las láminas dicen los mismos metros.
 *
 *   largo = recorrido medido (bajada en origen + tramo + subida en destino)
 *         + reserva para terminar en cada punta
 *         + 10 % de holgura en cable de rollo (curvas, bandeja, desperdicio)
 *
 * Los cables armados (HDMI, USB, DisplayPort, VGA) se redondean al largo
 * comercial que alcanza; los de rollo, al metro entero.
 */

import type { IoSignal } from "./io-profile/types";

/** Reserva para terminar el cable en cada punta (rulo de servicio), m. */
export const END_RESERVE_M = 0.6;
/** Holgura del cable de rollo. */
export const BULK_SLACK = 0.1;
/** Largos comerciales de cables armados (m). */
export const STANDARD_LENGTHS = [1, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50];
/** Canal UTP máximo sobre el largo TOTAL del cable (90 m de enlace + 10 m de patch). */
export const UTP_MAX_M = 100;

/** Señales de ficha que van en cable armado (se compra uno por tramo, de largo comercial). */
const PATCH_IO = new Set<IoSignal>(["hdmi", "displayport", "usb-a", "usb-b", "usb-c", "vga"]);
export const isPatchIo = (s: IoSignal) => PATCH_IO.has(s);

/** Largo final del cable para un recorrido medido (m). */
export function cableLengthM(runM: number, bulk: boolean): number {
  const need = Math.max(0, runM) + 2 * END_RESERVE_M;
  if (bulk) return Math.ceil(need * (1 + BULK_SLACK) - 1e-9);
  return STANDARD_LENGTHS.find((l) => l >= need - 1e-9) ?? Math.ceil(need / 10) * 10;
}

/* ───────────── Geometría del recorrido (una sola para motor y plano técnico) ───────────── */

/** Altura del tendido por piso / zócalo (m). */
export const FLOOR_RUN_Y = 0.02;
/** Las dos puntas por debajo de esto (piso, mesa, rack bajo): el cable va por piso / zócalo, no sube al cielorraso (m). */
export const LOW_END_M = 1.3;
/** Equipos de pared o rack a menos de esto en planta (receptor o códec detrás de la pantalla): tramo directo por detrás (m). */
export const DIRECT_RUN_M = 1.5;
/** Montajes que admiten el tramo directo por detrás. */
const DIRECT_MOUNTS = new Set(["wall", "rack"]);
/** Montajes que salen por una caja de piso (bajan al piso y van por él hasta la pared). */
const FLOOR_BOX_MOUNTS = new Set(["table", "floor"]);

/** Punta de un recorrido: posición y montaje (sin montaje: se toma como equipo de pared). */
export type RunEnd = { x: number; y: number; z: number; mount?: string | null };

/** Altura del cielorraso por la que corre el cable (m). */
export const ceilingRunY = (heightM: number) => Math.max(2.2, heightM - 0.03);

/** ¿Tramo directo por detrás de los equipos? (pared/rack y a menos de DIRECT_RUN_M en planta). */
export function isDirectRun(a: RunEnd, b: RunEnd): boolean {
  const ok = (e: RunEnd) => !e.mount || DIRECT_MOUNTS.has(e.mount);
  return ok(a) && ok(b) && Math.hypot(a.x - b.x, a.z - b.z) < DIRECT_RUN_M;
}

/** Altura del tendido: piso si las dos puntas están bajas (y ninguna en el techo); si no, cielorraso. */
export function runLevelY(a: RunEnd, b: RunEnd, heightM: number): number {
  const low = (e: RunEnd) => e.mount !== "ceiling" && e.y < LOW_END_M;
  return low(a) && low(b) ? FLOOR_RUN_Y : ceilingRunY(heightM);
}

/** ¿La punta sale por caja de piso? */
export const isFloorBox = (e: RunEnd) => Boolean(e.mount && FLOOR_BOX_MOUNTS.has(e.mount));

/** Tramo vertical en una punta: caja de piso baja al piso y sube por la pared; lo demás sube/baja directo. */
export function endVerticalM(e: RunEnd, runY: number): number {
  if (isFloorBox(e)) return Math.max(0, e.y - FLOOR_RUN_Y) + Math.max(0, runY - FLOOR_RUN_Y);
  return Math.abs(runY - e.y);
}

/**
 * Recorrido medido (m) entre dos puntas, dado el tramo en planta (incluye el
 * tramo por el piso hasta la pared de una caja de piso). Es la geometría que
 * dibuja el motor (cabling.ts routeCable) y la que mide el plano técnico
 * (wiring/validate.ts wireRunM): así la conexión de mesa → códec da los mismos metros.
 */
export function cableRunM(a: RunEnd, b: RunEnd, flatM: number, heightM: number): number {
  if (isDirectRun(a, b)) return flatM + Math.abs(a.y - b.y);
  const runY = runLevelY(a, b, heightM);
  return flatM + endVerticalM(a, runY) + endVerticalM(b, runY);
}
