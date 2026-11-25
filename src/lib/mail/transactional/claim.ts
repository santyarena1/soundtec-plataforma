// Reserva atómica de un envío registrado antes de mandarlo: si el cron y el botón
// «Enviar cola» (o dos admins) toman la misma fila, solo uno la manda.

export const SENDING_STATUS = "SENDING";
/** Un envío que quedó «enviando» más de esto (función cortada) se puede volver a tomar. */
export const SENDING_STALE_MS = 10 * 60_000;
const RETRYABLE = ["QUEUED", "FAILED", "SKIPPED"];

/** Condición del updateMany que reserva la fila (count === 1 → es nuestra). */
export function mailClaimWhere(id: string, nowMs: number) {
  return {
    id,
    OR: [{ status: { in: RETRYABLE } }, { status: SENDING_STATUS, updatedAt: { lt: new Date(nowMs - SENDING_STALE_MS) } }],
  };
}
