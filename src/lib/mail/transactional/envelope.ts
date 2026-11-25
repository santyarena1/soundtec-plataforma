/**
 * Remitente, respuesta y canal de cada mail transaccional. Puro y probado.
 *
 * Regla de oro: por SMTP el From es SIEMPRE la casilla autenticada (portal@).
 * soundtec.com.ar tiene DMARC en «reject»: un From distinto del usuario que
 * entra al servidor rebota o va a spam. Para que las respuestas lleguen a otra
 * casilla (p. ej. comercial@) está el Reply-To.
 */
import { isEmail, normalizeEmail } from "@/lib/mail/address";

export type Channel = "smtp" | "resend";
export type Address = { name: string; address: string };

export const DEFAULT_FROM_NAME = "Soundtec Portal";
export const DEFAULT_RESEND_FROM = "Soundtec Portal <no-responder@soundtecportal.com.ar>";
export const DEFAULT_HOURLY_LIMIT = 200;

/** Nombre visible sin caracteres que rompan el encabezado. */
export function cleanDisplayName(name: string | null | undefined): string {
  const clean = String(name ?? "").replace(/[\r\n"<>]/g, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, 80) || DEFAULT_FROM_NAME;
}

/** From por SMTP: el nombre configurado y la casilla con la que se entra al servidor. */
export function smtpFrom(accountUser: string, fromName: string | null | undefined): Address {
  return { name: cleanDisplayName(fromName), address: normalizeEmail(accountUser) };
}

/**
 * Reply-To: solo si es un mail válido y distinto de la casilla que manda
 * (vacío = las respuestas vuelven a la misma casilla, no hace falta el encabezado).
 */
export function resolveReplyTo(replyTo: string | null | undefined, sender: string): string | undefined {
  const value = normalizeEmail(replyTo);
  if (!value || !isEmail(value)) return undefined;
  if (value === normalizeEmail(sender)) return undefined;
  return value;
}

/**
 * Por Resend (respaldo) no se puede usar portal@ como From (otro dominio
 * verificado); las respuestas igual vuelven a la casilla configurada.
 */
export function resendEnvelope(input: { resendFrom?: string | null; replyTo?: string | null; accountUser?: string | null }): { from: string; replyTo?: string } {
  const from = input.resendFrom?.trim() || DEFAULT_RESEND_FROM;
  const reply = normalizeEmail(input.replyTo) || normalizeEmail(input.accountUser);
  return { from, replyTo: reply && isEmail(reply) ? reply : undefined };
}

export type ChannelPlan = { channels: Channel[]; whenEmpty: "SKIPPED" | "QUEUED" };

/**
 * Por dónde sale un mail. SMTP (portal@) primero; Resend solo como respaldo
 * si está habilitado. Si el cupo por hora del hosting se agotó, sale por
 * Resend o espera en cola (no se fuerza el SMTP: InMotion bloquea la casilla).
 */
export function planChannels(input: { smtpReady: boolean; resendReady: boolean; resendFallback: boolean; smtpBudgetLeft: number }): ChannelPlan {
  const resend = input.resendReady && input.resendFallback;
  if (input.smtpReady && input.smtpBudgetLeft > 0) return { channels: resend ? ["smtp", "resend"] : ["smtp"], whenEmpty: "SKIPPED" };
  if (input.smtpReady) return { channels: resend ? ["resend"] : [], whenEmpty: "QUEUED" };
  return { channels: resend ? ["resend"] : [], whenEmpty: "SKIPPED" };
}

/** Límite por hora: número entero razonable (1 a 5000); cualquier otra cosa vuelve al valor por defecto. */
export function parseHourlyLimit(value: string | number | null | undefined): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 5000 ? n : DEFAULT_HOURLY_LIMIT;
}

/** Lista de mails escrita a mano («a@x.com, b@y.com; c@z.com»): válidos, sin repetir. */
export function parseRecipientList(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const part of String(raw ?? "").split(/[\s,;]+/)) {
    const email = normalizeEmail(part);
    if (email && isEmail(email)) seen.add(email);
  }
  return [...seen].slice(0, 30);
}

/** Destinatarios inválidos de una lista (para avisar en la pantalla). */
export function invalidRecipients(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter((p) => p && !isEmail(p));
}
