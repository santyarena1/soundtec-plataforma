/**
 * Núcleo del envío transaccional, sin Next ni base: todo lo de afuera (SMTP,
 * Resend, registro, cifrado) entra por `deps`. Así se prueba con transportes
 * simulados y nunca sale un mail real de un test.
 */
import { isSensitiveKind, type MailKind } from "./kinds";
import { planChannels, type Address, type Channel } from "./envelope";

export type OutgoingMail = { kind: MailKind; to: string[]; subject: string; html: string; text: string };

/** Lo que llega al transporte: From ya resuelto por canal. */
export type WireMessage = { from: Address | string; replyTo?: string; to: string[]; subject: string; html: string; text: string };

export type DeliveryConfig = {
  /** null = casilla sin usuario/contraseña. */
  smtp: { from: Address; replyTo?: string } | null;
  /** null = sin clave de Resend. */
  resend: { from: string; replyTo?: string } | null;
  resendFallback: boolean;
  hourlyLimit: number;
  sentCopy: boolean;
};

export type LogStatus = "QUEUED" | "SENT" | "FAILED" | "SKIPPED";

export type LogPatch = {
  kind: string;
  to: string;
  subject: string;
  status: LogStatus;
  channel: Channel | null;
  error: string | null;
  messageId: string | null;
  payload: string | null;
  sentAt: Date | null;
};

export type DeliverDeps = {
  config: DeliveryConfig;
  sendSmtp(message: WireMessage): Promise<{ messageId?: string }>;
  sendResend(message: WireMessage): Promise<{ id?: string }>;
  /** Copia en «Enviados» de la casilla (IMAP). Sus errores no cuentan como fallo del envío. */
  copyToSent?(message: WireMessage): Promise<void>;
  smtpSentLastHour(): Promise<number>;
  /** Guarda el registro. Con `id` actualiza (reintento) y suma un intento. */
  saveLog(patch: LogPatch, id?: string): Promise<string>;
  /** Cifra el contenido para reintentar; null si no hay ENCRYPTION_KEY. */
  seal(plain: string): string | null;
  now?(): Date;
};

export type DeliverResult = {
  sent: boolean;
  status: LogStatus;
  channel: Channel | null;
  error: string | null;
  logId: string | null;
};

export function wireFor(channel: Channel, mail: OutgoingMail, config: DeliveryConfig): WireMessage {
  const envelope = channel === "smtp" ? config.smtp! : config.resend!;
  return { from: envelope.from, replyTo: envelope.replyTo, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text };
}

export function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").trim().slice(0, 500) || "Error desconocido";
}

/** Contenido para reintentar (cifrado). Nunca para mails sensibles. */
export function sealPayload(mail: OutgoingMail, seal: DeliverDeps["seal"]): string | null {
  if (isSensitiveKind(mail.kind)) return null;
  return seal(JSON.stringify({ kind: mail.kind, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text }));
}

export function parsePayload(plain: string): OutgoingMail | null {
  try {
    const data = JSON.parse(plain) as Partial<OutgoingMail>;
    if (!data || typeof data.subject !== "string" || typeof data.html !== "string" || typeof data.text !== "string" || !Array.isArray(data.to) || !data.to.length) return null;
    return { kind: (data.kind ?? "test") as MailKind, to: data.to.map(String), subject: data.subject, html: data.html, text: data.text };
  } catch {
    return null;
  }
}

/**
 * Manda un mail por el mejor canal disponible y deja el registro. Nunca tira:
 * el que llama decide qué mostrar (por ejemplo, el link para copiar).
 */
export async function deliver(deps: DeliverDeps, mail: OutgoingMail, options: { logId?: string } = {}): Promise<DeliverResult> {
  const now = deps.now ?? (() => new Date());
  const { config } = deps;
  const to = mail.to.join(", ");
  const base = { kind: mail.kind, to, subject: mail.subject.slice(0, 300) };
  const save = async (patch: Omit<LogPatch, "kind" | "to" | "subject">): Promise<string | null> => {
    try {
      return await deps.saveLog({ ...base, ...patch }, options.logId);
    } catch (error) {
      console.error("[correo] no se pudo registrar el envío", error);
      return options.logId ?? null;
    }
  };

  if (!mail.to.length) {
    return { sent: false, status: "SKIPPED", channel: null, error: "Sin destinatarios", logId: null };
  }

  let budgetLeft = 0;
  if (config.smtp) {
    const used = await deps.smtpSentLastHour().catch(() => 0);
    budgetLeft = config.hourlyLimit - used;
  }
  const plan = planChannels({ smtpReady: Boolean(config.smtp), resendReady: Boolean(config.resend), resendFallback: config.resendFallback, smtpBudgetLeft: budgetLeft });

  if (!plan.channels.length) {
    const status = plan.whenEmpty === "QUEUED" && !isSensitiveKind(mail.kind) ? "QUEUED" : "SKIPPED";
    const error = plan.whenEmpty === "QUEUED" ? `Se alcanzó el límite de ${config.hourlyLimit} mails por hora.` : "No hay casilla de envío configurada.";
    const logId = await save({ status, channel: null, error, messageId: null, payload: sealPayload(mail, deps.seal), sentAt: null });
    return { sent: false, status, channel: null, error, logId };
  }

  let lastError: string | null = null;
  for (const channel of plan.channels) {
    const message = wireFor(channel, mail, config);
    try {
      const messageId = channel === "smtp" ? ((await deps.sendSmtp(message)).messageId ?? null) : ((await deps.sendResend(message)).id ?? null);
      const logId = await save({ status: "SENT", channel, error: lastError ? `Por respaldo: ${lastError}`.slice(0, 500) : null, messageId, payload: null, sentAt: now() });
      if (channel === "smtp" && config.sentCopy && deps.copyToSent && !isSensitiveKind(mail.kind)) {
        await deps.copyToSent(message).catch((error) => console.error("[correo] no se pudo copiar a Enviados", errorText(error)));
      }
      return { sent: true, status: "SENT", channel, error: null, logId };
    } catch (error) {
      lastError = `${channel === "smtp" ? "SMTP" : "Resend"}: ${errorText(error)}`;
      console.error(`[correo] falló el envío por ${channel}`, lastError);
    }
  }
  const logId = await save({ status: "FAILED", channel: plan.channels[plan.channels.length - 1]!, error: lastError, messageId: null, payload: sealPayload(mail, deps.seal), sentAt: null });
  return { sent: false, status: "FAILED", channel: null, error: lastError, logId };
}
