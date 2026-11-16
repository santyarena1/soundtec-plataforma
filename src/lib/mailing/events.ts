import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/mail/address";

/**
 * Bajas y eventos de Resend (entregado, abierto, clic, rebote, queja). La lista
 * de supresión (MailSuppression) se respeta en TODO envío de campañas.
 */

export type SuppressionReason = "UNSUBSCRIBE" | "BOUNCE" | "COMPLAINT" | "MANUAL";

export const SUPPRESSION_LABELS: Record<SuppressionReason, string> = {
  UNSUBSCRIBE: "Se dio de baja",
  BOUNCE: "Rebote permanente",
  COMPLAINT: "Lo marcó como spam",
  MANUAL: "Cargado a mano",
};

/** Agrega a la supresión. Si ya estaba, una queja o baja reemplaza un motivo más débil. */
export async function suppress(email: string, reason: SuppressionReason, detail?: string | null, campaignId?: string | null): Promise<void> {
  const address = normalizeEmail(email);
  if (!address.includes("@")) return;
  const existing = await prisma.mailSuppression.findUnique({ where: { email: address }, select: { reason: true } });
  if (existing) {
    const stronger = reason === "COMPLAINT" || (reason === "UNSUBSCRIBE" && existing.reason !== "COMPLAINT");
    if (stronger && existing.reason !== reason) await prisma.mailSuppression.update({ where: { email: address }, data: { reason, detail: detail?.slice(0, 300) ?? null, campaignId: campaignId ?? null } });
    return;
  }
  await prisma.mailSuppression
    .create({ data: { email: address, reason, detail: detail?.slice(0, 300) ?? null, campaignId: campaignId ?? null } })
    .catch((error: unknown) => {
      // Dos bajas casi al mismo tiempo: la segunda choca con el único. Ya quedó suprimido.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    });
}

/** Baja desde el enlace del mail: supresión global + marca en la campaña de la que vino. */
export async function unsubscribe(email: string, campaignId: string | null, detail = "Desde el enlace del mail"): Promise<void> {
  await suppress(email, "UNSUBSCRIBE", detail, campaignId);
  if (campaignId) {
    await prisma.mailCampaignRecipient.updateMany({ where: { campaignId, email: normalizeEmail(email), unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
  }
}

type ResendEventData = {
  email_id?: string;
  to?: string[] | string;
  created_at?: string;
  bounce?: { type?: string; subType?: string; message?: string };
  click?: { link?: string };
  failed?: { reason?: string };
  tags?: Record<string, string> | Array<{ name: string; value: string }>;
};

export type ResendEvent = { type: string; created_at?: string; data?: ResendEventData };

function firstRecipient(data: ResendEventData): string | null {
  const to = Array.isArray(data.to) ? data.to[0] : data.to;
  return to ? normalizeEmail(to.replace(/^.*<([^>]+)>.*$/, "$1")) : null;
}

/**
 * Aplica un evento del webhook. `eventId` (svix-id) evita procesar dos veces
 * el mismo aviso (Resend reintenta si no respondemos rápido).
 */
export async function applyResendEvent(eventId: string, event: ResendEvent): Promise<{ duplicate: boolean; matched: boolean }> {
  const data = event.data ?? {};
  // Resend reintenta los avisos: si ya está, no se cuenta de nuevo (sin pasar por el error del único, que ensucia el log).
  if (await prisma.mailWebhookEvent.findUnique({ where: { id: eventId.slice(0, 120) }, select: { id: true } })) return { duplicate: true, matched: false };
  try {
    await prisma.mailWebhookEvent.create({ data: { id: eventId.slice(0, 120), type: event.type.slice(0, 60), emailId: data.email_id ?? null, payload: event as unknown as Prisma.InputJsonValue } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { duplicate: true, matched: false };
    throw error;
  }
  const at = new Date(data.created_at ?? event.created_at ?? Date.now());
  const when = Number.isNaN(at.getTime()) ? new Date() : at;
  const recipient = data.email_id ? await prisma.mailCampaignRecipient.findUnique({ where: { resendId: data.email_id }, select: { id: true, campaignId: true, email: true, openedAt: true, clickedAt: true, deliveredAt: true } }) : null;
  const email = recipient?.email ?? firstRecipient(data);
  const update = (values: Prisma.MailCampaignRecipientUpdateInput) => (recipient ? prisma.mailCampaignRecipient.update({ where: { id: recipient.id }, data: values }) : Promise.resolve(null));

  switch (event.type) {
    case "email.delivered":
      await update({ deliveredAt: recipient?.deliveredAt ?? when });
      break;
    case "email.opened":
      await update({ openedAt: recipient?.openedAt ?? when, openCount: { increment: 1 } });
      break;
    case "email.clicked":
      await update({ clickedAt: recipient?.clickedAt ?? when, clickCount: { increment: 1 }, lastClickUrl: data.click?.link?.slice(0, 500) ?? null, ...(recipient?.openedAt ? {} : { openedAt: when }) });
      break;
    case "email.bounced": {
      const type = data.bounce?.type ?? "";
      await update({ bouncedAt: when, bounceType: [type, data.bounce?.subType].filter(Boolean).join(" / ").slice(0, 80) || "Rebote", lastError: data.bounce?.message?.slice(0, 500) ?? null });
      // Los rebotes temporales (casilla llena, servidor caído) no se suprimen.
      if (email && !/transient/i.test(type)) await suppress(email, "BOUNCE", data.bounce?.message ?? type, recipient?.campaignId);
      break;
    }
    case "email.complained":
      await update({ complainedAt: when });
      if (email) await suppress(email, "COMPLAINT", "Lo marcó como spam", recipient?.campaignId);
      break;
    case "email.failed":
      await update({ status: "FAILED", lastError: data.failed?.reason?.slice(0, 500) ?? "Resend no lo pudo mandar." });
      break;
    case "email.suppressed":
      await update({ status: "FAILED", lastError: "Resend no lo mandó: la dirección está en su lista de supresión." });
      if (email) await suppress(email, "BOUNCE", "Suprimido por Resend", recipient?.campaignId);
      break;
    default:
      break;
  }
  return { duplicate: false, matched: Boolean(recipient) };
}
