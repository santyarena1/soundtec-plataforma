/**
 * Compatibilidad: el envío transaccional vive en src/server/mail/transactional.ts
 * (casilla del portal por SMTP, Resend solo de respaldo, registro en MailLog).
 * Esto queda para código que todavía importe `sendMail`.
 */
import { sendTransactional } from "@/server/mail/transactional";
import { noticeRecipients } from "@/lib/mail/transactional/settings";
import type { MailKind } from "@/lib/mail/transactional/kinds";

export interface MailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  kind?: MailKind;
}

export type MailResult = { sent: true } | { sent: false; reason: "NO_PROVIDER" | "ERROR" | "QUEUED" };

export async function sendMail(input: MailInput): Promise<MailResult> {
  const result = await sendTransactional({ kind: input.kind ?? "test", to: Array.isArray(input.to) ? input.to : [input.to], subject: input.subject, html: input.html, text: input.text });
  if (result.sent) return { sent: true };
  return { sent: false, reason: result.status === "SKIPPED" ? "NO_PROVIDER" : result.status === "QUEUED" ? "QUEUED" : "ERROR" };
}

/** Destinatarios de avisos de solicitudes de cuenta (Configuración › Correo). */
export async function accountRequestRecipients(): Promise<string[]> {
  return noticeRecipients("account_request");
}
