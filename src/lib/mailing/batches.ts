import { createHash } from "node:crypto";
import { RESEND_BATCH_MAX } from "@/lib/mailing/resend-client";

/**
 * Reglas del envío en tandas (puras, sin base): tamaño de cada tanda según el
 * límite diario, clave de idempotencia y encabezados de baja.
 */

/** Argentina no tiene horario de verano: el día arranca a las 03:00 UTC. */
export function startOfDayArgentina(now = new Date()): Date {
  const shifted = new Date(now.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 3, 0, 0));
}

/** Cuántos quedan hoy. Límite 0 = sin límite. */
export function remainingToday(dailyLimit: number, sentToday: number): number {
  if (!dailyLimit || dailyLimit <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, dailyLimit - sentToday);
}

/** Tamaño de la próxima tanda: el configurado, sin pasar de 100 (Resend) ni de lo que queda hoy. */
export function nextBatchSize(batchSize: number, remaining: number): number {
  const size = Math.max(1, Math.min(RESEND_BATCH_MAX, Math.floor(batchSize) || RESEND_BATCH_MAX));
  return Math.max(0, Math.min(size, remaining));
}

/**
 * Clave de idempotencia de una tanda: la misma campaña con los mismos
 * destinatarios da siempre la misma clave. Si la tanda se reintenta (la
 * función se cortó, Resend tardó), Resend reconoce la clave y no reenvía.
 */
export function batchIdempotencyKey(campaignId: string, recipientIds: string[]): string {
  const digest = createHash("sha256").update([...recipientIds].sort().join(",")).digest("hex").slice(0, 32);
  return `camp-${campaignId}-${digest}`;
}

/** Encabezados para el botón «Desuscribirse» de Gmail/Yahoo/Apple (RFC 8058, baja en un clic). */
export function unsubscribeHeaders(oneClickUrl: string, mailto?: string | null): Record<string, string> {
  const parts = [`<${oneClickUrl}>`];
  if (mailto) parts.push(`<mailto:${mailto}?subject=baja>`);
  return { "List-Unsubscribe": parts.join(", "), "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
