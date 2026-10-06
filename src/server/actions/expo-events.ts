"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";
import { generateQrCode } from "@/lib/expo/qr-code";
import { searchShowcaseCandidates } from "@/server/expo/showcase";

const eventSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(3).max(160),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    displayOrientation: z.enum(["AUTO", "LANDSCAPE", "PORTRAIT"]),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "La fecha de fin tiene que ser posterior al inicio" });

export async function saveExpoEvent(formData: FormData): Promise<{ ok: boolean; error?: string; id?: string }> {
  await requirePermission("settings.manage");
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { id, ...data } = parsed.data;
  const event = id
    ? await prisma.expoEvent.update({ where: { id }, data })
    : await prisma.expoEvent.create({ data: { ...data, qrs: { create: { label: "Principal", code: generateQrCode() } } } });
  revalidatePath("/admin/settings/expo");
  return { ok: true, id: event.id };
}

export async function createExpoQr(eventId: string, label: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("settings.manage");
  const clean = label.trim();
  if (clean.length < 2) return { ok: false, error: "Poné un nombre (ej. Folleto)" };
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.expoQr.create({ data: { eventId, label: clean.slice(0, 80), code: generateQrCode() } });
      revalidatePath(`/admin/settings/expo/${eventId}`);
      return { ok: true };
    } catch (error) {
      if (attempt === 4) throw error; // colisión de código improbable: reintenta
    }
  }
  return { ok: false, error: "No se pudo crear el QR" };
}

export async function toggleExpoQr(qrId: string, _formData?: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const qr = await prisma.expoQr.findUniqueOrThrow({ where: { id: qrId } });
  await prisma.expoQr.update({ where: { id: qrId }, data: { isActive: !qr.isActive } });
  revalidatePath(`/admin/settings/expo/${qr.eventId}`);
}

const MAX_SHOWCASE = 40;

/** Busca productos (con foto) para la vidriera del stand. */
export async function searchShowcaseProducts(query: string, brand?: string) {
  await requirePermission("settings.manage");
  return searchShowcaseCandidates(query.slice(0, 80), brand?.slice(0, 80));
}

/** Guarda los productos elegidos para la vidriera, en orden. Vacío = automático. */
export async function saveShowcaseProducts(eventId: string, productIds: string[]): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("settings.manage");
  const ids = [...new Set(productIds.filter((id) => typeof id === "string" && id.length < 60))].slice(0, MAX_SHOWCASE);
  await prisma.expoEvent.update({ where: { id: eventId }, data: { showcaseProductIds: ids } });
  revalidatePath(`/admin/settings/expo/${eventId}`);
  return { ok: true };
}
