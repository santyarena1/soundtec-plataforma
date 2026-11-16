"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { appUrl } from "@/lib/app-url";
import { isEmail, normalizeEmail } from "@/lib/mail/address";
import { blocksSchema, readBlocks, starterBlocks } from "@/lib/mailing/blocks";
import { campaignAudienceSchema, readAudience, type RecipientStats } from "@/lib/mailing/audience";
import { resolveCampaignAudience } from "@/lib/mailing/sources";
import { materializeCampaign, processCampaign, sendTestEmail, type TickResult } from "@/lib/mailing/sender";
import { getMailingConfig } from "@/lib/mailing/config";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Una llamada desde la pantalla no puede pasar el límite de la función (Vercel): se manda lo que entra en 40 s. */
const SCREEN_STEP_MS = 40_000;

async function guard() {
  return requireStaff("marketing.manage");
}

function revalidate(id?: string) {
  revalidatePath("/admin/mailing");
  if (id) revalidatePath(`/admin/mailing/${id}`);
}

export async function createCampaign(input: { name?: string }): Promise<Result<{ id: string }>> {
  const { user } = await guard();
  const name = (input.name ?? "").trim().slice(0, 120) || `Campaña ${new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`;
  const campaign = await prisma.mailCampaign.create({
    data: { name, subject: "", preheader: "", blocks: starterBlocks() as unknown as Prisma.InputJsonValue, audience: { include: [], exclude: [] }, createdById: user.id },
  });
  revalidate();
  return { ok: true, id: campaign.id };
}

const saveSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1, "Ponele un nombre a la campaña.").max(120),
  subject: z.string().max(200),
  preheader: z.string().max(200),
  blocks: blocksSchema,
  audience: campaignAudienceSchema,
});

export async function saveCampaign(input: unknown): Promise<Result> {
  await guard();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { id, ...data } = parsed.data;
  const current = await prisma.mailCampaign.findUnique({ where: { id }, select: { status: true } });
  if (!current) return { ok: false, error: "La campaña ya no existe." };
  if (!["DRAFT", "SCHEDULED"].includes(current.status)) return { ok: false, error: "Una campaña que ya salió no se edita. Duplicala para mandar otra." };
  await prisma.mailCampaign.update({ where: { id }, data: { ...data, blocks: data.blocks as unknown as Prisma.InputJsonValue, audience: data.audience } });
  revalidate(id);
  return { ok: true };
}

export async function duplicateCampaign(input: { id: string }): Promise<Result<{ id: string }>> {
  const { user } = await guard();
  const source = await prisma.mailCampaign.findUnique({ where: { id: input.id } });
  if (!source) return { ok: false, error: "La campaña ya no existe." };
  const copy = await prisma.mailCampaign.create({
    data: {
      name: `${source.name} (copia)`.slice(0, 120),
      subject: source.subject,
      preheader: source.preheader,
      blocks: (source.blocks ?? []) as Prisma.InputJsonValue,
      audience: (source.audience ?? { include: [], exclude: [] }) as Prisma.InputJsonValue,
      createdById: user.id,
    },
  });
  revalidate();
  return { ok: true, id: copy.id };
}

export async function deleteCampaign(input: { id: string }): Promise<Result> {
  await guard();
  const current = await prisma.mailCampaign.findUnique({ where: { id: input.id }, select: { status: true } });
  if (!current) return { ok: true };
  if (current.status === "SENDING") return { ok: false, error: "Está saliendo: pausala o cancelala antes de borrarla." };
  await prisma.mailCampaign.delete({ where: { id: input.id } });
  revalidate();
  return { ok: true };
}

/** Cuántos la reciben de verdad (listas − excluidas − bajas/rebotes − repetidos). */
export async function previewCampaignAudience(input: unknown): Promise<Result<{ stats: RecipientStats; missingLists: number; sample: Array<{ email: string; name: string | null; company: string | null }> }>> {
  await guard();
  const parsed = campaignAudienceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Audiencia inválida." };
  const { recipients, stats, missingLists } = await resolveCampaignAudience(parsed.data);
  return { ok: true, stats, missingLists, sample: recipients.slice(0, 6).map((r) => ({ email: r.email, name: r.name ?? null, company: r.company ?? null })) };
}

function readyToSend(campaign: { subject: string; blocks: Prisma.JsonValue | null; audience: Prisma.JsonValue | null }): string | null {
  if (!campaign.subject.trim()) return "Falta el asunto.";
  if (!readBlocks(campaign.blocks).length) return "El mail está vacío: agregá al menos un bloque.";
  if (!readAudience(campaign.audience).include.length) return "Elegí al menos una lista de destinatarios.";
  return null;
}

export async function sendCampaignTest(input: { id: string; to: string }): Promise<Result<{ simulated: boolean }>> {
  const { user } = await guard();
  const to = normalizeEmail(input.to);
  if (!isEmail(to)) return { ok: false, error: "Ese mail no es válido." };
  const campaign = await prisma.mailCampaign.findUnique({ where: { id: input.id }, select: { id: true, subject: true, preheader: true, blocks: true } });
  if (!campaign) return { ok: false, error: "La campaña ya no existe." };
  if (!campaign.subject.trim()) return { ok: false, error: "Falta el asunto." };
  const result = await sendTestEmail(campaign, to, { email: to, name: user.name ?? "Ana Gómez", company: user.companyName ?? "Estudio AV" });
  return result.ok ? { ok: true, simulated: result.simulated } : { ok: false, error: result.error };
}

const startSchema = z.object({
  id: z.string().min(1).max(60),
  /** ISO. Vacío = ahora. */
  scheduledAt: z.string().max(40).optional().nullable(),
});

/** Manda ahora (arma la cola) o la deja programada. */
export async function startCampaign(input: unknown): Promise<Result<{ total: number; scheduled: boolean; simulated: boolean }>> {
  await guard();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const campaign = await prisma.mailCampaign.findUnique({ where: { id: parsed.data.id }, select: { id: true, status: true, subject: true, blocks: true, audience: true } });
  if (!campaign) return { ok: false, error: "La campaña ya no existe." };
  if (!["DRAFT", "SCHEDULED"].includes(campaign.status)) return { ok: false, error: "Esta campaña ya salió." };
  const problem = readyToSend(campaign);
  if (problem) return { ok: false, error: problem };
  const config = await getMailingConfig();

  if (parsed.data.scheduledAt) {
    const when = new Date(parsed.data.scheduledAt);
    if (Number.isNaN(when.getTime())) return { ok: false, error: "Fecha inválida." };
    if (when.getTime() > Date.now() + 60_000) {
      const { stats } = await resolveCampaignAudience(readAudience(campaign.audience));
      if (!stats.total) return { ok: false, error: "La audiencia quedó vacía." };
      await prisma.mailCampaign.update({ where: { id: campaign.id }, data: { status: "SCHEDULED", scheduledAt: when, note: null } });
      revalidate(campaign.id);
      return { ok: true, total: stats.total, scheduled: true, simulated: config.simulate };
    }
  }
  // Evita que dos clics (o dos personas) arranquen la misma campaña.
  const locked = await prisma.mailCampaign.updateMany({ where: { id: campaign.id, status: { in: ["DRAFT", "SCHEDULED"] } }, data: { status: "SENDING", scheduledAt: null } });
  if (!locked.count) return { ok: false, error: "La campaña ya se está mandando." };
  const result = await materializeCampaign(campaign.id);
  if (!result.ok) {
    await prisma.mailCampaign.update({ where: { id: campaign.id }, data: { status: "DRAFT" } });
    return { ok: false, error: result.error };
  }
  revalidate(campaign.id);
  return { ok: true, total: result.total, scheduled: false, simulated: config.simulate };
}

export async function unscheduleCampaign(input: { id: string }): Promise<Result> {
  await guard();
  await prisma.mailCampaign.updateMany({ where: { id: input.id, status: "SCHEDULED" }, data: { status: "DRAFT", scheduledAt: null } });
  revalidate(input.id);
  return { ok: true };
}

export async function pauseCampaign(input: { id: string }): Promise<Result> {
  await guard();
  await prisma.mailCampaign.updateMany({ where: { id: input.id, status: "SENDING" }, data: { status: "PAUSED", note: "Pausada a mano." } });
  revalidate(input.id);
  return { ok: true };
}

export async function resumeCampaign(input: { id: string }): Promise<Result> {
  await guard();
  await prisma.mailCampaign.updateMany({ where: { id: input.id, status: "PAUSED" }, data: { status: "SENDING", note: null } });
  revalidate(input.id);
  return { ok: true };
}

/** Corta el envío: los que estaban en cola no reciben nada. Lo que ya salió, salió. */
export async function cancelCampaign(input: { id: string }): Promise<Result<{ canceled: number }>> {
  await guard();
  const updated = await prisma.mailCampaign.updateMany({ where: { id: input.id, status: { in: ["SENDING", "PAUSED", "SCHEDULED"] } }, data: { status: "CANCELED", finishedAt: new Date(), note: "Cancelada a mano." } });
  if (!updated.count) return { ok: false, error: "No se puede cancelar en este estado." };
  const { count } = await prisma.mailCampaignRecipient.updateMany({ where: { campaignId: input.id, status: "QUEUED" }, data: { status: "CANCELED" } });
  revalidate(input.id);
  return { ok: true, canceled: count };
}

/** Una vuelta de envío desde la pantalla (además del cron, que sigue aunque se cierre). */
export async function processCampaignStep(input: { id: string }): Promise<Result<TickResult & { status: string }>> {
  await guard();
  const result = await processCampaign(input.id, Date.now() + SCREEN_STEP_MS);
  const campaign = await prisma.mailCampaign.findUnique({ where: { id: input.id }, select: { status: true } });
  return { ok: true, ...result, status: campaign?.status ?? "CANCELED" };
}

/** Buscador de productos para el bloque «Productos» (con foto, marca y enlace a la ficha pública). */
export async function searchCampaignProducts(query: string) {
  await guard();
  const q = query.trim().slice(0, 120);
  const { buildProductSearchWhere, sortBySearchRelevance, SEARCH_RANK_SELECT } = await import("@/lib/product-search");
  const rows = await prisma.product.findMany({
    where: { isActive: true, ...(q ? buildProductSearchWhere(q) : {}) },
    orderBy: { normalizedName: "asc" },
    take: 120,
    select: {
      id: true,
      ...SEARCH_RANK_SELECT,
      shortDescription: true,
      brand: { select: { name: true } },
      images: { select: { url: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 },
    },
  });
  const ranked = q ? sortBySearchRelevance(rows, q, (row) => ({ ...row, brandName: row.brand?.name ?? null })).slice(0, 30) : rows.slice(0, 30);
  const { productSubtitle, productTitle, tangoCode } = await import("@/lib/product-display");
  const origin = appUrl();
  return ranked.map((row) => ({
    id: row.id,
    title: productTitle(row),
    subtitle: productSubtitle(row),
    brand: row.brand?.name ?? null,
    code: tangoCode(row.internalSku),
    imageUrl: row.images[0]?.url ?? null,
    url: `${origin}/catalogo/${row.id}`,
    note: row.images[0] ? null : "sin foto",
  }));
}

/** SVG no: Gmail y Outlook no lo muestran. */
const MAIL_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_MAIL_IMAGE_BYTES = 4 * 1024 * 1024;

/** Sube una imagen para un bloque del mail (banner, foto). Devuelve la URL pública. */
export async function uploadMailingImage(formData: FormData): Promise<Result<{ url: string }>> {
  await guard();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elegí una imagen." };
  if (!MAIL_IMAGE_TYPES.has(file.type)) return { ok: false, error: "Formato no admitido: PNG, JPG, WebP o GIF (los programas de mail no muestran SVG)." };
  if (file.size > MAX_MAIL_IMAGE_BYTES) return { ok: false, error: "La imagen pesa más de 4 MB: achicala (para un mail alcanza con 1200 px de ancho)." };
  const { BLOB_NOT_CONFIGURED, BLOB_UPLOAD_FAILED, isBlobConfigured, uploadFile } = await import("@/lib/blob-storage");
  if (!isBlobConfigured()) return { ok: false, error: BLOB_NOT_CONFIGURED };
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  try {
    const url = await uploadFile(`mailing/${Date.now()}.${ext}`, Buffer.from(await file.arrayBuffer()), file.type);
    return { ok: true, url };
  } catch (error) {
    console.error("[uploadMailingImage]", error);
    return { ok: false, error: BLOB_UPLOAD_FAILED };
  }
}
