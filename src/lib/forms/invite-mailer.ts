import { simpleParser } from "mailparser";
import { prisma } from "@/lib/prisma";
import { createImap, createTransport, findSentFolder, getMailAccount } from "@/lib/mail/account";
import { readSettings } from "@/lib/forms/types";
import { inviteHeaderUrl, inviteUrl } from "@/lib/forms/invites";
import { renderInviteEmail } from "@/lib/forms/invite-email";

/** Por tanda: el hosting limita los envíos por hora; con 10 por llamada y pausas no se pasa. */
export const INVITE_BATCH_SIZE = 10;
/** Pausa entre mails dentro de una tanda. */
const PAUSE_MS = 1200;

export type SendMode = "pending" | "reminder";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A quién le toca: pendientes (nunca enviados o que fallaron) o recordatorio (enviados que no respondieron). */
function whereFor(formId: string, mode: SendMode, startedAt: Date) {
  return mode === "pending"
    ? // Los que fallan en esta corrida quedan con updatedAt nuevo: no se reintentan hasta la próxima.
      { formId, status: { in: ["PENDING", "FAILED"] }, updatedAt: { lt: startedAt } }
    : { formId, status: "SENT", respondedAt: null, sentAt: { lt: startedAt } };
}

export async function countToSend(formId: string, mode: SendMode, startedAt = new Date()): Promise<number> {
  return prisma.formInvite.count({ where: whereFor(formId, mode, startedAt) });
}

/**
 * Manda una tanda de invitaciones. `startedAt` es cuándo arrancó el envío
 * completo: así un recordatorio no le vuelve a llegar a quien ya lo recibió en
 * esta misma corrida. Deja una copia de cada mail en «Enviados» de la casilla.
 */
export async function sendInviteBatch(formId: string, mode: SendMode, startedAt: Date): Promise<{ sent: number; failed: number; remaining: number; error?: string }> {
  const account = await getMailAccount();
  if (!account) return { sent: 0, failed: 0, remaining: 0, error: "Falta configurar la cuenta de correo (Configuración › Correo de envío)." };
  const form = await prisma.form.findUnique({ where: { id: formId }, select: { title: true, token: true, settings: true } });
  if (!form) return { sent: 0, failed: 0, remaining: 0, error: "Ese formulario ya no existe." };
  const settings = readSettings(form.settings);
  const headerUrl = inviteHeaderUrl(settings.logoUrl || settings.welcomeImageUrl);

  const batch = await prisma.formInvite.findMany({ where: whereFor(formId, mode, startedAt), orderBy: { createdAt: "asc" }, take: INVITE_BATCH_SIZE });
  const transport = createTransport(account);
  const raws: Buffer[] = [];
  let sent = 0;
  let failed = 0;
  for (const invite of batch) {
    const mail = renderInviteEmail({
      formTitle: form.title,
      subject: settings.inviteSubject,
      message: settings.inviteMessage,
      button: settings.inviteButton,
      url: inviteUrl(form.token, invite.code),
      headerUrl,
      eventTitle: settings.welcomeTitle,
      details: settings.endInfo,
      accent: settings.accent,
      invite,
      reminder: mode === "reminder",
    });
    const message = {
      from: { name: account.fromName, address: account.user },
      to: invite.name ? { name: invite.name, address: invite.email } : invite.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    };
    try {
      await transport.sendMail(message);
      sent += 1;
      await prisma.formInvite.update({ where: { id: invite.id }, data: { status: "SENT", sentAt: new Date(), sendCount: { increment: 1 }, lastError: null } });
      // La copia para «Enviados» se arma aparte (el transporte SMTP no la guarda en la casilla).
      const copy = await createRawMessage(message);
      if (copy) raws.push(copy);
    } catch (error) {
      failed += 1;
      const text = error instanceof Error ? error.message : String(error);
      await prisma.formInvite.update({ where: { id: invite.id }, data: { status: "FAILED", sendCount: { increment: 1 }, lastError: text.slice(0, 500) } });
      // Credenciales o límite del servidor: no tiene sentido seguir con el resto de la tanda.
      if (/auth|login|credentials|535|rate|limit|too many/i.test(text)) {
        transport.close();
        return { sent, failed, remaining: await countToSend(formId, mode, startedAt), error: `El servidor de correo frenó el envío: ${text.slice(0, 200)}` };
      }
    }
    await sleep(PAUSE_MS);
  }
  transport.close();
  if (raws.length) await appendToSent(account, raws);
  return { sent, failed, remaining: await countToSend(formId, mode, startedAt) };
}

async function createRawMessage(message: Parameters<ReturnType<typeof createTransport>["sendMail"]>[0]): Promise<Buffer | null> {
  try {
    const { default: MailComposer } = await import("nodemailer/lib/mail-composer");
    return await new MailComposer(message).compile().build();
  } catch (error) {
    console.error("[invites] No se pudo armar la copia para Enviados", error);
    return null;
  }
}

async function appendToSent(account: NonNullable<Awaited<ReturnType<typeof getMailAccount>>>, raws: Buffer[]) {
  const client = createImap(account);
  try {
    await client.connect();
    const folder = await findSentFolder(client);
    if (folder) for (const raw of raws) await client.append(folder, raw, ["\\Seen"]);
    await client.logout();
  } catch (error) {
    console.error("[invites] No se pudo copiar a Enviados", error);
    client.close();
  }
}

const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery/i;
const BOUNCE_SUBJECT = /undeliver|delivery status|delivery failure|failure notice|returned mail|no se (pudo|ha podido) entregar|rechaz/i;

/**
 * Revisa la bandeja de entrada desde el primer envío: marca rebotes (y de
 * qué invitado eran) y guarda las respuestas por mail de los invitados.
 */
export async function checkInviteInbox(formId: string): Promise<{ replies: number; bounces: number; error?: string }> {
  const account = await getMailAccount();
  if (!account) return { replies: 0, bounces: 0, error: "Falta configurar la cuenta de correo." };
  const invites = await prisma.formInvite.findMany({ where: { formId, sentAt: { not: null } }, select: { id: true, email: true, sentAt: true, repliedAt: true, status: true } });
  if (!invites.length) return { replies: 0, bounces: 0 };
  const since = new Date(Math.min(...invites.map((i) => i.sentAt!.getTime())));
  const byEmail = new Map(invites.map((i) => [i.email.toLowerCase(), i]));
  let replies = 0;
  let bounces = 0;
  const client = createImap(account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ since }, { uid: true });
      const list = Array.isArray(uids) ? uids.slice(-400) : [];
      for await (const message of client.fetch(list, { source: true, envelope: true }, { uid: true })) {
        const from = message.envelope?.from?.[0]?.address?.toLowerCase() ?? "";
        const subject = message.envelope?.subject ?? "";
        const date = message.envelope?.date ? new Date(message.envelope.date) : new Date();
        const isBounce = BOUNCE_FROM.test(from) || BOUNCE_SUBJECT.test(subject);
        const invite = byEmail.get(from);
        if (!isBounce && !invite) continue;
        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        if (isBounce) {
          const body = `${parsed.text ?? ""}\n${typeof parsed.html === "string" ? parsed.html : ""}`.toLowerCase();
          for (const candidate of invites) {
            if (candidate.status !== "BOUNCED" && body.includes(candidate.email.toLowerCase())) {
              await prisma.formInvite.update({ where: { id: candidate.id }, data: { status: "BOUNCED", lastError: subject.slice(0, 300) || "Rebotó" } });
              candidate.status = "BOUNCED";
              bounces += 1;
            }
          }
          continue;
        }
        if (invite && date > invite.sentAt! && (!invite.repliedAt || date > invite.repliedAt)) {
          const snippet = stripQuoted(parsed.text ?? "").slice(0, 1500);
          await prisma.formInvite.update({ where: { id: invite.id }, data: { repliedAt: date, replySnippet: snippet || subject } });
          invite.repliedAt = date;
          replies += 1;
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (error) {
    client.close();
    return { replies, bounces, error: error instanceof Error ? error.message : "No se pudo leer la casilla." };
  }
  return { replies, bounces };
}

/** Saca la parte citada de una respuesta («El … escribió:» y las líneas con >). */
function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^(El|On) .+(escribió|wrote):?\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*(Mensaje original|Original Message)/i.test(line.trim())) break;
    out.push(line);
  }
  return out.join("\n").trim();
}
