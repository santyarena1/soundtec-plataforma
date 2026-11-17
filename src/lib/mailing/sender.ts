import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { readBlocks } from "@/lib/mailing/blocks";
import { readAudience } from "@/lib/mailing/audience";
import { renderCampaignEmail } from "@/lib/mailing/template";
import { finalizeCustomHtml, finalizeCustomText, hasUnsubscribeMarker } from "@/lib/mailing/html-finalize";
import { htmlToPlainText } from "@/lib/mailing/html-template";
import { fillVariables } from "@/lib/mailing/variables";
import { addressOf, getMailingConfig, type MailingConfig } from "@/lib/mailing/config";
import { resolveCampaignAudience, suppressedEmails } from "@/lib/mailing/sources";
import { createUnsubscribeToken } from "@/lib/mailing/unsubscribe-token";
import { batchIdempotencyKey, chunk, nextBatchSize, remainingToday, startOfDayArgentina, unsubscribeHeaders } from "@/lib/mailing/batches";
import { sendBatch, sendSingle, type ResendEmail } from "@/lib/mailing/resend-client";
import type { MailContact } from "@/lib/mailing/variables";

/**
 * Motor de envío de campañas. La cola es la tabla MailCampaignRecipient:
 *
 *   QUEUED → SENDING (reservado por una tanda) → SENT / SIMULATED / FAILED / SKIPPED
 *
 * Cada tanda reserva destinatarios con FOR UPDATE SKIP LOCKED (dos procesos a
 * la vez —el cron y la pantalla— nunca toman los mismos) y los manda en una sola
 * llamada a Resend con una clave de idempotencia derivada de los ids: si la
 * función se corta después de mandar, la tanda se reintenta con la misma clave
 * y Resend no la vuelve a enviar. Antes de cada tanda se vuelve a mirar la
 * lista de supresión (alguien pudo darse de baja mientras salía la campaña).
 */

/** Una tanda reservada que no terminó en este tiempo se considera cortada y se retoma. */
const STUCK_MS = 10 * 60_000;
/** Resend recuerda la clave de idempotencia 24 h: pasado eso no se reintenta a ciegas. */
const IDEMPOTENCY_WINDOW_MS = 23 * 3600_000;
/** Pausa entre tandas (Resend permite pocos pedidos por segundo por cuenta). */
const PAUSE_BETWEEN_BATCHES_MS = 700;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ClaimedRow = { id: string; email: string; name: string | null; company: string | null; fields: Prisma.JsonValue | null };

export type TickResult = { sent: number; simulated: number; failed: number; skipped: number; remaining: number; done: boolean; note?: string };

function fieldsOf(raw: Prisma.JsonValue | null): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? "")]));
}

export function unsubscribeUrlFor(email: string, campaignId: string | null): string {
  return `${appUrl()}/baja/${createUnsubscribeToken({ email, campaignId })}`;
}

export function oneClickUrlFor(email: string, campaignId: string | null): string {
  return `${appUrl()}/api/mailing/baja?t=${encodeURIComponent(createUnsubscribeToken({ email, campaignId }))}`;
}

type CampaignContent = { id: string; subject: string; preheader: string; blocks: Prisma.JsonValue | null; contentMode?: string | null; customHtml?: string | null };

/** Texto plano de un HTML propio: se calcula una vez por HTML (no por cada destinatario). */
let plainCache: { html: string; text: string } | null = null;
function plainTextOf(html: string): string {
  if (plainCache?.html !== html) plainCache = { html, text: htmlToPlainText(html) };
  return plainCache.text;
}

function renderContent(campaign: CampaignContent, contact: MailContact, config: MailingConfig): { subject: string; html: string; text: string } {
  const unsubscribeUrl = unsubscribeUrlFor(contact.email, campaign.id);
  if (campaign.contentMode === "HTML" && campaign.customHtml) {
    const hadMarker = hasUnsubscribeMarker(campaign.customHtml);
    return {
      subject: fillVariables(campaign.subject.trim() || "(sin asunto)", contact),
      html: finalizeCustomHtml({ html: campaign.customHtml, contact, preheader: campaign.preheader, unsubscribeUrl, footer: config.footer }),
      text: finalizeCustomText({ text: plainTextOf(campaign.customHtml), contact, preheader: campaign.preheader, unsubscribeUrl, footer: config.footer, hadMarker }),
    };
  }
  return renderCampaignEmail({ subject: campaign.subject, preheader: campaign.preheader, blocks: readBlocks(campaign.blocks), contact, unsubscribeUrl, footer: config.footer, origin: appUrl() });
}

/** El mail final para una persona (con su enlace de baja y los encabezados de baja en un clic). */
export function buildEmail(campaign: CampaignContent, contact: MailContact, config: MailingConfig, options: { testPrefix?: boolean } = {}): ResendEmail {
  const rendered = renderContent(campaign, contact, config);
  return {
    from: config.from,
    to: [contact.email],
    subject: options.testPrefix ? `[Prueba] ${rendered.subject}` : rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(config.replyTo ? { reply_to: [config.replyTo] } : {}),
    headers: unsubscribeHeaders(oneClickUrlFor(contact.email, campaign.id), config.replyTo || addressOf(config.from)),
    tags: [{ name: "campaign", value: campaign.id.replace(/[^A-Za-z0-9_-]/g, "") }],
  };
}

/**
 * Arma la cola: calcula los destinatarios reales (listas − excluidas −
 * supresión, sin repetidos) y los guarda. Si se llama dos veces no duplica
 * (único por campaña + mail).
 */
export async function materializeCampaign(campaignId: string): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const campaign = await prisma.mailCampaign.findUnique({ where: { id: campaignId }, select: { id: true, audience: true, status: true } });
  if (!campaign) return { ok: false, error: "La campaña ya no existe." };
  const { recipients } = await resolveCampaignAudience(readAudience(campaign.audience));
  if (!recipients.length) return { ok: false, error: "La audiencia quedó vacía (después de sacar bajas, rebotes y excluidos)." };
  const config = await getMailingConfig();
  for (const part of chunk(recipients, 1000)) {
    await prisma.mailCampaignRecipient.createMany({
      data: part.map((r) => ({
        campaignId,
        email: r.email,
        name: r.name?.slice(0, 200) ?? null,
        company: r.company?.slice(0, 200) ?? null,
        fields: r.fields ? (r.fields as Prisma.InputJsonValue) : Prisma.JsonNull,
      })),
      skipDuplicates: true,
    });
  }
  const total = await prisma.mailCampaignRecipient.count({ where: { campaignId } });
  await prisma.mailCampaign.update({
    where: { id: campaignId },
    data: { status: "SENDING", startedAt: new Date(), simulated: config.simulate, note: null },
  });
  return { ok: true, total };
}

/** Reserva hasta `size` destinatarios en cola. Atómico: nadie más puede tomarlos. */
async function claim(campaignId: string, size: number): Promise<{ rows: ClaimedRow[]; claimKey: string }> {
  const claimKey = `claim-${randomBytes(8).toString("hex")}`;
  const rows = await prisma.$queryRaw<ClaimedRow[]>`
    UPDATE "MailCampaignRecipient" SET "status" = 'SENDING', "batchKey" = ${claimKey}, "claimedAt" = NOW(), "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id" FROM "MailCampaignRecipient"
      WHERE "campaignId" = ${campaignId} AND "status" = 'QUEUED'
      ORDER BY "createdAt", "id"
      LIMIT ${size}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "email", "name", "company", "fields"`;
  return { rows, claimKey };
}

async function sentTodayCount(): Promise<number> {
  return prisma.mailCampaignRecipient.count({ where: { status: "SENT", sentAt: { gte: startOfDayArgentina() } } });
}

async function remainingCount(campaignId: string): Promise<number> {
  return prisma.mailCampaignRecipient.count({ where: { campaignId, status: { in: ["QUEUED", "SENDING"] } } });
}

/** Saca de la tanda a los que se dieron de baja / rebotaron mientras la campaña salía. */
async function dropSuppressed(rows: ClaimedRow[]): Promise<{ keep: ClaimedRow[]; skipped: number }> {
  const suppressed = await suppressedEmails(rows.map((r) => r.email));
  if (!suppressed.size) return { keep: rows, skipped: 0 };
  const drop = rows.filter((r) => suppressed.has(r.email));
  await prisma.mailCampaignRecipient.updateMany({
    where: { id: { in: drop.map((r) => r.id) } },
    data: { status: "SKIPPED", lastError: "Está en la lista de supresión (baja, rebote o queja)." },
  });
  return { keep: rows.filter((r) => !suppressed.has(r.email)), skipped: drop.length };
}

type SendOutcome = { kind: "sent"; count: number } | { kind: "simulated"; count: number } | { kind: "rejected"; error: string } | { kind: "unknown"; error: string };

/** Manda una tanda ya reservada (o la simula). `batchKey` es la clave de idempotencia. */
async function deliver(campaign: CampaignContent, rows: ClaimedRow[], batchKey: string, config: MailingConfig): Promise<SendOutcome> {
  const now = new Date();
  if (config.simulate) {
    await prisma.$transaction(
      rows.map((r) =>
        prisma.mailCampaignRecipient.update({ where: { id: r.id }, data: { status: "SIMULATED", sentAt: now, resendId: `sim_${r.id}`, lastError: null } })
      )
    );
    return { kind: "simulated", count: rows.length };
  }
  const emails = rows.map((r) => buildEmail(campaign, { email: r.email, name: r.name, company: r.company, fields: fieldsOf(r.fields) }, config));
  const result = await sendBatch({ apiKey: config.apiKey }, emails, batchKey);
  if (!result.ok) {
    // 4xx (clave inválida, dominio sin verificar, datos rechazados): Resend no mandó nada.
    const definite = result.status >= 400 && result.status < 500 && result.status !== 429 && result.status !== 409;
    return definite ? { kind: "rejected", error: result.error } : { kind: "unknown", error: result.error };
  }
  await prisma.$transaction(
    rows.map((r, i) =>
      prisma.mailCampaignRecipient.update({ where: { id: r.id }, data: { status: "SENT", sentAt: now, resendId: result.data.ids[i] ?? null, lastError: null } })
    )
  );
  return { kind: "sent", count: rows.length };
}

/** Tandas que quedaron a medias (la función se cortó): se reintentan con su misma clave. */
async function recoverStuck(campaign: CampaignContent, config: MailingConfig): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_MS);
  const keys = await prisma.mailCampaignRecipient.groupBy({
    by: ["batchKey"],
    where: { campaignId: campaign.id, status: "SENDING", claimedAt: { lt: cutoff } },
    _min: { claimedAt: true },
  });
  for (const group of keys.slice(0, 20)) {
    const key = group.batchKey ?? "";
    const where = { campaignId: campaign.id, status: "SENDING", batchKey: group.batchKey };
    // Reservada pero nunca enviada (se cortó antes de la llamada): vuelve a la cola.
    if (!key || key.startsWith("claim-")) {
      await prisma.mailCampaignRecipient.updateMany({ where, data: { status: "QUEUED", batchKey: null, claimedAt: null } });
      continue;
    }
    const oldest = group._min.claimedAt?.getTime() ?? 0;
    // La clave se calculó con TODOS los ids de la tanda: si parte ya se confirmó, reenviar el resto sería una tanda distinta.
    const confirmed = await prisma.mailCampaignRecipient.count({ where: { campaignId: campaign.id, batchKey: key, status: { not: "SENDING" } } });
    if (Date.now() - oldest > IDEMPOTENCY_WINDOW_MS || confirmed > 0) {
      await prisma.mailCampaignRecipient.updateMany({ where, data: { status: "FAILED", lastError: "No se pudo confirmar si salió (la tanda se cortó a mitad de camino)." } });
      continue;
    }
    const rows = await prisma.mailCampaignRecipient.findMany({ where, select: { id: true, email: true, name: true, company: true, fields: true } });
    await prisma.mailCampaignRecipient.updateMany({ where, data: { claimedAt: new Date() } });
    const outcome = await deliver(campaign, rows, key, config);
    if (outcome.kind === "rejected") {
      await prisma.mailCampaignRecipient.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "QUEUED", batchKey: null, claimedAt: null, lastError: outcome.error.slice(0, 500) } });
    }
  }
}

async function finishIfEmpty(campaignId: string): Promise<boolean> {
  const left = await remainingCount(campaignId);
  if (left > 0) return false;
  await prisma.mailCampaign.updateMany({ where: { id: campaignId, status: "SENDING" }, data: { status: "SENT", finishedAt: new Date(), note: null } });
  return true;
}

/**
 * Procesa tandas de una campaña hasta que se termina, se pausa, se llega al
 * límite diario o se acaba el tiempo (`deadline`, ms). Lo llaman el cron y la
 * pantalla mientras está abierta.
 */
export async function processCampaign(campaignId: string, deadline: number): Promise<TickResult> {
  const result: TickResult = { sent: 0, simulated: 0, failed: 0, skipped: 0, remaining: 0, done: false };
  const config = await getMailingConfig();
  let first = true;
  while (Date.now() < deadline) {
    const campaign = await prisma.mailCampaign.findUnique({ where: { id: campaignId }, select: { id: true, status: true, subject: true, preheader: true, blocks: true, simulated: true, contentMode: true, customHtml: true } });
    if (!campaign || campaign.status !== "SENDING") break;
    // Una campaña que arrancó simulada termina simulada (y al revés): no se mezcla.
    const effective: MailingConfig = { ...config, simulate: campaign.simulated };
    if (!campaign.simulated && !config.apiKey) {
      await prisma.mailCampaign.update({ where: { id: campaignId }, data: { status: "PAUSED", note: "Falta la API key de Resend: la campaña quedó en pausa." } });
      result.note = "Falta la API key de Resend.";
      break;
    }
    if (first) {
      await recoverStuck(campaign, effective);
      first = false;
    }
    const allowance = campaign.simulated ? Number.POSITIVE_INFINITY : remainingToday(config.dailyLimit, await sentTodayCount());
    const size = nextBatchSize(config.batchSize, allowance);
    if (size === 0) {
      const note = `Llegó al límite de ${config.dailyLimit} mails por día. Sigue sola mañana desde las 00:00.`;
      await prisma.mailCampaign.update({ where: { id: campaignId }, data: { note } });
      result.note = note;
      break;
    }
    const { rows, claimKey } = await claim(campaignId, size);
    if (!rows.length) {
      result.done = await finishIfEmpty(campaignId);
      break;
    }
    const { keep, skipped } = await dropSuppressed(rows);
    result.skipped += skipped;
    if (!keep.length) continue;
    const batchKey = batchIdempotencyKey(campaignId, keep.map((r) => r.id));
    const updated = await prisma.mailCampaignRecipient.updateMany({ where: { id: { in: keep.map((r) => r.id) }, batchKey: claimKey }, data: { batchKey } });
    if (updated.count !== keep.length) continue;
    const outcome = await deliver(campaign, keep, batchKey, effective);
    if (outcome.kind === "sent") result.sent += outcome.count;
    else if (outcome.kind === "simulated") result.simulated += outcome.count;
    else if (outcome.kind === "rejected") {
      await prisma.mailCampaignRecipient.updateMany({ where: { id: { in: keep.map((r) => r.id) } }, data: { status: "QUEUED", batchKey: null, claimedAt: null, lastError: outcome.error.slice(0, 500) } });
      const note = `Resend rechazó el envío: ${outcome.error.slice(0, 200)}. La campaña quedó en pausa; corregí y reanudá.`;
      await prisma.mailCampaign.update({ where: { id: campaignId }, data: { status: "PAUSED", note } });
      result.note = note;
      break;
    } else {
      // No se sabe si salió: queda reservada y se reintenta (con la misma clave) en unos minutos.
      const note = `Resend no respondió (${outcome.error.slice(0, 120)}). Se reintenta solo en unos minutos.`;
      await prisma.mailCampaign.update({ where: { id: campaignId }, data: { note } });
      result.note = note;
      break;
    }
    if (!campaign.simulated) await sleep(PAUSE_BETWEEN_BATCHES_MS);
  }
  result.remaining = await remainingCount(campaignId);
  if (result.remaining === 0 && !result.done) result.done = await finishIfEmpty(campaignId);
  return result;
}

/** Lo que corre el cron: arranca las programadas que vencieron y avanza las que están saliendo. */
export async function runMailingQueue(deadline: number): Promise<{ started: number; processed: Array<{ id: string } & TickResult> }> {
  const due = await prisma.mailCampaign.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } }, select: { id: true }, take: 5 });
  let started = 0;
  for (const c of due) {
    const res = await materializeCampaign(c.id);
    if (res.ok) started += 1;
    else await prisma.mailCampaign.update({ where: { id: c.id }, data: { status: "PAUSED", note: `No se pudo arrancar: ${res.error}` } });
  }
  const sending = await prisma.mailCampaign.findMany({ where: { status: "SENDING" }, orderBy: { startedAt: "asc" }, select: { id: true }, take: 10 });
  const processed: Array<{ id: string } & TickResult> = [];
  for (const c of sending) {
    if (Date.now() >= deadline) break;
    processed.push({ id: c.id, ...(await processCampaign(c.id, deadline)) });
  }
  return { started, processed };
}

/** Prueba: un mail suelto a una dirección (con «[Prueba]» en el asunto). En modo prueba no sale. */
export async function sendTestEmail(campaign: CampaignContent, to: string, sample: MailContact): Promise<{ ok: true; simulated: boolean } | { ok: false; error: string }> {
  const config = await getMailingConfig();
  if (config.simulate) return { ok: true, simulated: true };
  const email = buildEmail(campaign, { ...sample, email: to }, config, { testPrefix: true });
  const result = await sendSingle({ apiKey: config.apiKey }, email);
  return result.ok ? { ok: true, simulated: false } : { ok: false, error: result.error };
}
