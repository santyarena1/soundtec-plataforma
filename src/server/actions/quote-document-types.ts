"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { permissionsHave } from "@/lib/permissions";
import { loadQuoteForEdit, requireQuotePermission } from "@/lib/quote-access";
import { QUOTE_MODULES } from "@/lib/quote-defaults";
import { isQuoteAudience } from "@/lib/quote-audiences";
import { BASE_DOCUMENT_TYPES, toDocumentType } from "@/lib/quote-document-types";
import { applyTextVariantsToQuote } from "@/lib/quote-text-variants-apply";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MODULE_KEYS = QUOTE_MODULES.map((m) => m.key);

const typeInput = z.object({
  name: z.string().trim().min(2, "Poné un nombre (ej. «Compacto escolar»).").max(60),
  baseKey: z.enum(BASE_DOCUMENT_TYPES.map((t) => t.key) as ["resumido", "tecnico", "premium"]),
  audience: z.string().nullable().refine((v) => v === null || isQuoteAudience(v), "Rubro desconocido."),
  sectionKeys: z.array(z.string().refine((k) => MODULE_KEYS.includes(k), "Sección desconocida.")).min(1, "Elegí al menos una sección."),
  description: z.string().trim().max(200).nullable().optional(),
});

async function requireLibrary() {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    throw new Error("No tenés permiso para cambiar los tipos de documento.");
  }
}

function refresh() {
  revalidatePath("/admin/settings/quotes");
  revalidatePath("/admin/quotes/quick");
  revalidatePath("/admin/quotes/new");
}

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos.";

export async function createDocumentType(input: z.input<typeof typeInput>): Promise<Result<{ key: string }>> {
  try {
    await requireLibrary();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const parsed = typeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const exists = await prisma.quoteContentProfile.findFirst({ where: { name: { equals: parsed.data.name, mode: "insensitive" }, isActive: true } });
  if (exists) return { ok: false, error: "Ya hay un tipo con ese nombre." };
  const key = `propio-${randomBytes(4).toString("hex")}`;
  await prisma.quoteContentProfile.create({
    data: { key, name: parsed.data.name, baseKey: parsed.data.baseKey, audience: parsed.data.audience, sectionKeys: parsed.data.sectionKeys, description: parsed.data.description ?? null, isCustom: true },
  });
  refresh();
  return { ok: true, key };
}

export async function updateDocumentType(key: string, input: z.input<typeof typeInput>): Promise<Result> {
  try {
    await requireLibrary();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const parsed = typeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const row = await prisma.quoteContentProfile.findUnique({ where: { key } });
  if (!row?.isCustom) return { ok: false, error: "Los tres tipos base no se cambian: creá uno propio a partir de ellos." };
  await prisma.quoteContentProfile.update({
    where: { key },
    data: { name: parsed.data.name, baseKey: parsed.data.baseKey, audience: parsed.data.audience, sectionKeys: parsed.data.sectionKeys, description: parsed.data.description ?? null },
  });
  refresh();
  return { ok: true };
}

/** Se archiva: las cotizaciones que ya lo usan no cambian. */
export async function archiveDocumentType(key: string): Promise<Result> {
  try {
    await requireLibrary();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const updated = await prisma.quoteContentProfile.updateMany({ where: { key, isCustom: true }, data: { isActive: false } });
  if (!updated.count) return { ok: false, error: "Ese tipo ya no existe o es uno base." };
  refresh();
  return { ok: true };
}

/**
 * Cambia el tipo de documento de una cotización ya creada: prende y apaga las
 * secciones según el tipo y pone la versión de los textos que le toca (sin
 * tocar lo que se escribió a mano).
 */
export async function changeQuoteDocumentType(input: { quoteId: string; key: string; audience?: string | null }): Promise<Result> {
  const loaded = await loadQuoteForEdit(input.quoteId);
  if (!loaded.quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };
  const row = await prisma.quoteContentProfile.findUnique({ where: { key: input.key } });
  if (!row || !row.isActive) return { ok: false, error: "Ese tipo de documento ya no existe." };
  const type = toDocumentType(row);
  const audience = input.audience === undefined ? undefined : input.audience && isQuoteAudience(input.audience) ? input.audience : null;
  await prisma.quote.update({ where: { id: input.quoteId }, data: { contentProfileId: row.id, ...(audience !== undefined ? { audience } : {}) } });
  const wanted = new Set(type.sectionKeys);
  for (const section of loaded.quote.sections) {
    if (!MODULE_KEYS.includes(section.type)) continue; // los módulos agregados a mano quedan como están
    const included = wanted.has(section.type);
    if (section.included !== included) await prisma.quoteSection.update({ where: { id: section.id }, data: { included } });
  }
  await applyTextVariantsToQuote(input.quoteId);
  revalidatePath(`/admin/quotes/${input.quoteId}`);
  return { ok: true };
}
