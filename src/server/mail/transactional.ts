/**
 * Servicio único de mails transaccionales del portal. Sale por la casilla
 * configurada en Configuración › Correo (portal@soundtec.com.ar, SMTP de
 * InMotion); Resend solo como respaldo si se habilita. Cada envío queda en
 * MailLog para «Últimos envíos» y reintentos. Nunca tira: devuelve si salió.
 *
 * Pruebas locales: MAIL_TRANSPORT=stream (fuera de producción) simula el SMTP
 * con el stream de nodemailer y guarda cada mail en MAIL_SIM_DIR (o en la
 * carpeta temporal del sistema). No sale nada a internet.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { decryptSecret, encryptSecret, encryptionAvailable } from "@/lib/secret-box";
import { createImap, createTransport, findSentFolder, getMailAccount, type MailAccount } from "@/lib/mail/account";
import { deliver, errorText, parsePayload, type DeliverDeps, type DeliverResult, type DeliveryConfig, type LogPatch, type OutgoingMail, type WireMessage } from "@/lib/mail/transactional/deliver";
import { resendEnvelope, resolveReplyTo, smtpFrom } from "@/lib/mail/transactional/envelope";
import type { NoticeKind } from "@/lib/mail/transactional/kinds";
import type { RenderedMail } from "@/lib/mail/transactional/template";
import { getResendKey, getTransactionalSettings, noticeRecipients } from "@/lib/mail/transactional/settings";
import { mailClaimWhere, SENDING_STATUS } from "@/lib/mail/transactional/claim";

const HOUR_MS = 60 * 60 * 1000;
const IMAP_COPY_TIMEOUT_MS = 12_000;
/** Contenido guardado para reintentar: se borra pasado este tiempo. */
const PAYLOAD_RETENTION_MS = 14 * 24 * HOUR_MS;
const SIMULATED_SENDER = "portal@soundtec.com.ar";

export function isSimulatedTransport(): boolean {
  return process.env.MAIL_TRANSPORT === "stream" && process.env.NODE_ENV !== "production";
}

export async function smtpSentLastHour(): Promise<number> {
  return prisma.mailLog.count({ where: { channel: "smtp", status: "SENT", sentAt: { gte: new Date(Date.now() - HOUR_MS) } } });
}

/** Cuántos mails más se pueden mandar por la casilla en esta hora. */
export async function smtpBudgetLeft(): Promise<number> {
  const settings = await getTransactionalSettings();
  return Math.max(0, settings.hourlyLimit - (await smtpSentLastHour().catch(() => 0)));
}

type Runtime = { deps: DeliverDeps; account: MailAccount | null; simulated: boolean };

async function simulatedSend(message: WireMessage): Promise<{ messageId?: string }> {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const info = await transport.sendMail(message);
  const dir = process.env.MAIL_SIM_DIR || path.join(tmpdir(), "soundtec-mail-sim");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = message.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${stamp}-${slug}.eml`), info.message as Buffer);
  await writeFile(path.join(dir, `${stamp}-${slug}.html`), message.html, "utf8");
  console.info(`[correo simulado] «${message.subject}» → ${message.to.join(", ")} (guardado en ${dir})`);
  return { messageId: info.messageId };
}

async function copyToSentFolder(account: MailAccount, message: WireMessage): Promise<void> {
  const { default: MailComposer } = await import("nodemailer/lib/mail-composer");
  const raw = await new MailComposer(message).compile().build();
  const client = createImap(account);
  const timer = setTimeout(() => client.close(), IMAP_COPY_TIMEOUT_MS);
  try {
    await client.connect();
    const folder = await findSentFolder(client);
    if (folder) await client.append(folder, raw, ["\\Seen"]);
    await client.logout();
  } catch (error) {
    client.close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaResend(apiKey: string, message: WireMessage): Promise<{ id?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: typeof message.from === "string" ? message.from : `${message.from.name} <${message.from.address}>`,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Resend respondió ${res.status} ${body.slice(0, 200)}`);
  try {
    return { id: (JSON.parse(body) as { id?: string }).id };
  } catch {
    return {};
  }
}

async function saveLog(patch: LogPatch, id?: string): Promise<string> {
  if (id) {
    await prisma.mailLog.update({ where: { id }, data: { ...patch, attempts: { increment: 1 } } });
    return id;
  }
  const row = await prisma.mailLog.create({ data: { ...patch, attempts: 1 }, select: { id: true } });
  return row.id;
}

async function runtime(): Promise<Runtime> {
  const [account, settings, resendKey] = await Promise.all([getMailAccount().catch((error) => {
    // Sin casilla los mails sensibles quedan sin salir: que quede rastro (p. ej. cambió ENCRYPTION_KEY).
    console.error("[correo] no se pudo leer la casilla de envío", error);
    return null;
  }), getTransactionalSettings(), getResendKey()]);
  const simulated = isSimulatedTransport();
  const sender = account?.user ?? (simulated ? SIMULATED_SENDER : null);
  const config: DeliveryConfig = {
    smtp: sender ? { from: smtpFrom(sender, account?.fromName), replyTo: resolveReplyTo(settings.replyTo, sender) } : null,
    resend: resendKey ? resendEnvelope({ resendFrom: settings.resendFrom, replyTo: settings.replyTo, accountUser: sender }) : null,
    resendFallback: settings.resendFallback && !simulated,
    hourlyLimit: settings.hourlyLimit,
    sentCopy: settings.sentCopy && !simulated,
  };
  const deps: DeliverDeps = {
    config,
    sendSmtp: async (message) => {
      if (simulated) return simulatedSend(message);
      const transport = createTransport(account!);
      try {
        const info = await transport.sendMail(message);
        return { messageId: info.messageId };
      } finally {
        transport.close();
      }
    },
    sendResend: (message) => sendViaResend(resendKey, message),
    copyToSent: account && !simulated ? (message) => copyToSentFolder(account, message) : undefined,
    smtpSentLastHour,
    saveLog,
    seal: (plain) => (encryptionAvailable() ? encryptSecret(plain) : null),
  };
  return { deps, account, simulated };
}

/** Manda un mail transaccional. */
export async function sendTransactional(mail: OutgoingMail): Promise<DeliverResult> {
  try {
    const { deps } = await runtime();
    return await deliver(deps, mail);
  } catch (error) {
    console.error("[correo] no se pudo preparar el envío", error);
    return { sent: false, status: "FAILED", channel: null, error: errorText(error), logId: null };
  }
}

/** Arma y manda un mail renderizado (atajo para los flujos). */
export async function sendRendered(kind: OutgoingMail["kind"], to: string | string[], render: (portalUrl: string) => RenderedMail): Promise<DeliverResult> {
  const mail = render(appUrl());
  return sendTransactional({ kind, to: Array.isArray(to) ? to : [to], ...mail });
}

/**
 * Aviso interno al equipo: a los destinatarios configurados para ese tipo
 * (más `extra`, p. ej. los mails propios de un formulario). Sin destinatarios no hace nada.
 */
export async function notifyTeam(kind: NoticeKind, render: (portalUrl: string) => RenderedMail, extra: string[] = []): Promise<DeliverResult | null> {
  try {
    const to = [...new Set([...(await noticeRecipients(kind)), ...extra.map((e) => e.trim().toLowerCase()).filter(Boolean)])];
    if (!to.length) return null;
    return await sendRendered(`notice_${kind}`, to, render);
  } catch (error) {
    console.error(`[correo] no se pudo avisar (${kind})`, error);
    return null;
  }
}

/** ¿Hay por dónde mandar mails? (casilla cargada, Resend de respaldo o simulación local). */
export async function transactionalChannelReady(): Promise<boolean> {
  try {
    const { deps } = await runtime();
    return Boolean(deps.config.smtp || (deps.config.resend && deps.config.resendFallback));
  } catch {
    return false;
  }
}

export type RetryOutcome = { ok: true; result: DeliverResult } | { ok: false; error: string };

/** Reintenta un envío registrado (fallido, sin canal o en cola). */
export async function retryMailLog(id: string): Promise<RetryOutcome> {
  const row = await prisma.mailLog.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Ese envío ya no existe." };
  if (row.status === "SENT") return { ok: false, error: "Ese mail ya salió." };
  if (!row.payload) return { ok: false, error: "Este mail no se puede reintentar (no se guarda su contenido). Generalo de nuevo desde su pantalla." };
  const mail = parsePayload(decryptSecret(row.payload));
  if (!mail) return { ok: false, error: "No se pudo leer el contenido guardado (¿cambió ENCRYPTION_KEY?)." };
  const { deps } = await runtime();
  // Reserva atómica: si otra corrida (cron o botón) ya la tomó, no se manda dos veces.
  const claimed = await prisma.mailLog.updateMany({ where: mailClaimWhere(row.id, Date.now()), data: { status: SENDING_STATUS } });
  if (claimed.count !== 1) return { ok: false, error: "Ese mail ya se está mandando." };
  try {
    return { ok: true, result: await deliver(deps, mail, { logId: row.id }) };
  } catch (error) {
    await prisma.mailLog.update({ where: { id: row.id }, data: { status: row.status, error: errorText(error) } }).catch(() => undefined);
    throw error;
  }
}

/**
 * Manda lo que quedó en cola por el tope por hora (lo llama el cron y el
 * botón de la pantalla). Además borra el contenido guardado de envíos viejos.
 */
export async function processMailQueue(max = 50): Promise<{ sent: number; failed: number; remaining: number }> {
  await prisma.mailLog
    .updateMany({ where: { payload: { not: null }, createdAt: { lt: new Date(Date.now() - PAYLOAD_RETENTION_MS) } }, data: { payload: null } })
    .catch((error) => console.error("[correo] no se pudo limpiar contenido viejo", error));
  const budget = Math.min(max, await smtpBudgetLeft());
  const rows = budget > 0 ? await prisma.mailLog.findMany({ where: { status: "QUEUED", payload: { not: null } }, orderBy: { createdAt: "asc" }, take: budget, select: { id: true } }) : [];
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const outcome = await retryMailLog(row.id);
    if (outcome.ok && outcome.result.sent) sent += 1;
    else failed += 1;
  }
  const remaining = await prisma.mailLog.count({ where: { status: "QUEUED", payload: { not: null } } });
  return { sent, failed, remaining };
}

/** Deja asentado un mail que mandó otro módulo por la misma casilla (cuenta para el tope por hora). */
export async function recordExternalSend(input: { kind: OutgoingMail["kind"]; to: string; subject: string; ok: boolean; error?: string | null }): Promise<void> {
  await prisma.mailLog
    .create({
      data: {
        kind: input.kind,
        to: input.to,
        subject: input.subject.slice(0, 300),
        status: input.ok ? "SENT" : "FAILED",
        channel: "smtp",
        error: input.error?.slice(0, 500) ?? null,
        sentAt: input.ok ? new Date() : null,
        attempts: 1,
      },
    })
    .catch((error) => console.error("[correo] no se pudo registrar el envío externo", error));
}
