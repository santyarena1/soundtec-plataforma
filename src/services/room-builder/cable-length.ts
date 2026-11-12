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
