/**
 * Envío de mails vía la API HTTP de Resend. Mientras no haya RESEND_API_KEY
 * (env) o "mail.resend_api_key" (AdminSetting) no envía nada y lo deja en el
 * log: los flujos funcionan igual (el admin copia el link a mano).
 */
import { getSetting } from "@/lib/settings";

export interface MailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

export type MailResult = { sent: true } | { sent: false; reason: "NO_PROVIDER" | "ERROR" };

const DEFAULT_FROM = "Soundtec <no-responder@soundtecportal.com.ar>";

export async function sendMail(input: MailInput): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY || (await getSetting("mail.resend_api_key", ""));
  if (!apiKey) {
    console.info(`[mailer] sin proveedor configurado; no se envió "${input.subject}"`);
    return { sent: false, reason: "NO_PROVIDER" };
  }
  const from = (await getSetting("mail.from", "")) || DEFAULT_FROM;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html, text: input.text }),
    });
    if (!res.ok) {
      console.error(`[mailer] Resend respondió ${res.status}`, await res.text().catch(() => ""));
      return { sent: false, reason: "ERROR" };
    }
    return { sent: true };
  } catch (error) {
    console.error("[mailer] fallo de red", error);
    return { sent: false, reason: "ERROR" };
  }
}

/** Destinatarios de avisos internos (AdminSetting "mail.notify_account_requests", separados por coma). */
export async function accountRequestRecipients(): Promise<string[]> {
  const raw = await getSetting("mail.notify_account_requests", "");
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
