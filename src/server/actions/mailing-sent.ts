"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getMailingConfig } from "@/lib/mailing/config";
import { getEmail } from "@/lib/mailing/resend-client";
import { patchFromResend } from "@/lib/mailing/sent-table";

type Result = { ok: true; checked: number; updated: number; remaining: number } | { ok: false; error: string };

/** Por clic: con la pausa entre pedidos (Resend permite ~2 por segundo) son ~25 s. */
const MAX_PER_RUN = 40;
const PAUSE_MS = 600;
const LOOKBACK_DAYS = 30;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * «Traer de Resend»: para los enviados de los últimos 30 días que no tienen
 * confirmación de entrega (o apertura), consulta el último evento en Resend y
 * completa lo que falte. Respeta el límite de pedidos (pausa + reintento en 429).
 */
export async function refreshFromResendAction(input?: { campaignId?: string | null }): Promise<Result> {
  await requireStaff("marketing.manage");
  const config = await getMailingConfig();
  if (!config.apiKey) return { ok: false, error: "Falta la API key de Resend (Campañas › Configuración)." };
  const campaignId = typeof input?.campaignId === "string" && /^[a-z0-9]{10,40}$/i.test(input.campaignId) ? input.campaignId : undefined;
  const where = {
    status: "SENT",
    resendId: { not: null },
    sentAt: { gte: new Date(Date.now() - LOOKBACK_DAYS * 86_400_000) },
    bouncedAt: null,
    complainedAt: null,
    OR: [{ deliveredAt: null }, { openedAt: null }],
    ...(campaignId ? { campaignId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.mailCampaignRecipient.findMany({
      where,
      // Primero los que ni siquiera tienen entrega confirmada.
      orderBy: [{ deliveredAt: { sort: "asc", nulls: "first" } }, { sentAt: "desc" }],
      take: MAX_PER_RUN,
      select: { id: true, resendId: true, status: true, deliveredAt: true, openedAt: true, clickedAt: true, bouncedAt: true, complainedAt: true },
    }),
    prisma.mailCampaignRecipient.count({ where }),
  ]);
  let updated = 0;
  let checked = 0;
  for (const row of rows) {
    if (checked > 0) await sleep(PAUSE_MS);
    const result = await getEmail({ apiKey: config.apiKey }, row.resendId!);
    checked += 1;
    if (!result.ok) {
      if (result.status === 401 || result.status === 403) return { ok: false, error: "Resend rechazó la API key (sin permiso para leer envíos). Usá una key con acceso completo." };
      if (result.status === 404) continue;
      console.warn("[mailing] Resend no devolvió el estado de", row.resendId, result.error);
      continue;
    }
    const patch = patchFromResend(row, result.data.last_event ?? "", new Date());
    if (!patch) continue;
    await prisma.mailCampaignRecipient.update({ where: { id: row.id }, data: patch });
    updated += 1;
  }
  revalidatePath("/admin/mailing/enviados");
  return { ok: true, checked, updated, remaining: Math.max(0, total - checked) };
}
