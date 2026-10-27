"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { isVariantBlockKey } from "@/lib/quote-block-variants";
import { legacyAudience } from "@/lib/quote-audiences";
import { isQuoteAudience } from "@/lib/quote-audiences-db";
import { moduleByKey } from "@/lib/quote-defaults";
import { sanitizeQuoteHtml } from "@/lib/quote-richtext";
import { getQuoteOpenAI } from "@/lib/quote-llm";
import { rewriteSectionBody } from "@/services/quote-orchestrator";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const PROFILE_KEYS = ["resumido", "tecnico", "premium"] as const;
const PROFILE_LABEL: Record<string, string> = { resumido: "Corto", tecnico: "Estándar", premium: "Completo" };

async function requireLibrary() {
  const { user, permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    throw new Error("No tenés permiso para editar los textos del PDF.");
  }
  return user;
}

const variantInput = z.object({
  blockKey: z.string().refine(isVariantBlockKey, "Este texto no admite versiones."),
  label: z.string().trim().min(2, "Poné un nombre a la versión.").max(80),
  body: z.string().trim().min(1, "La versión está vacía.").max(40000),
  profiles: z.array(z.enum(PROFILE_KEYS)).max(3),
  audiences: z.array(z.string().refine(async (k) => isQuoteAudience(k), "Esa opción de «A quién va» ya no existe.")).max(100),
});

function revalidate() {
  revalidatePath("/admin/settings/quotes/textos");
  revalidatePath("/admin/settings/quotes");
}

const firstError = (error: z.ZodError) => error.issues[0]?.message ?? "Datos inválidos.";

/** Texto general (el que sale si ninguna versión aplica). Las cotizaciones ya creadas no cambian. */
export async function saveGeneralText(input: { blockKey: string; body: string }): Promise<Result> {
  try {
    await requireLibrary();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!moduleByKey(input.blockKey) || !isVariantBlockKey(input.blockKey)) return { ok: false, error: "Texto inválido." };
  const body = sanitizeQuoteHtml(input.body.trim());
  if (!body) return { ok: false, error: "El texto general no puede quedar vacío." };
  const updated = await prisma.quoteBlock.updateMany({ where: { key: input.blockKey, isActive: true }, data: { body } });
  if (!updated.count) return { ok: false, error: "No encontramos ese texto en la plantilla." };
  revalidate();
  revalidatePath("/admin/settings/quotes/plantilla");
  return { ok: true };
}

export async function createTextVariant(input: z.input<typeof variantInput>): Promise<Result<{ id: string }>> {
  let userId: string;
  try {
    userId = (await requireLibrary()).id;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const parsed = await variantInput.safeParseAsync(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const row = await prisma.quoteTextVariant.create({
    data: { ...parsed.data, body: sanitizeQuoteHtml(parsed.data.body), createdById: userId },
  });
  revalidate();
  return { ok: true, id: row.id };
}

export async function updateTextVariant(input: { id: string } & z.input<typeof variantInput>): Promise<Result> {
  try {
    await requireLibrary();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const parsed = await variantInput.safeParseAsync(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const existing = await prisma.quoteTextVariant.findFirst({ where: { id: input.id, isActive: true } });
  if (!existing || existing.blockKey !== parsed.data.blockKey) return { ok: false, error: "Esa versión ya no existe." };
  const { blockKey: _blockKey, ...data } = parsed.data;
  await prisma.quoteTextVariant.update({ where: { id: input.id }, data: { ...data, body: sanitizeQuoteHtml(data.body) } });
  revalidate();
  return { ok: true };
}

/** Se archiva: las cotizaciones que ya la usaron conservan su texto. */
export async function deleteTextVariant(id: string): Promise<Result> {
  try {
    await requireLibrary();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const updated = await prisma.quoteTextVariant.updateMany({ where: { id, isActive: true }, data: { isActive: false } });
  if (!updated.count) return { ok: false, error: "Esa versión ya no existe." };
  revalidate();
  return { ok: true };
}

/**
 * Borrador de una versión escrito por la IA a partir del texto general.
 * No guarda nada: devuelve el texto para revisarlo.
 */
export async function draftTextVariantWithAI(input: {
  blockKey: string;
  baseBody: string;
  audience?: string | null;
  profile?: string | null;
  instruction?: string | null;
}): Promise<Result<{ body: string }>> {
  try {
    await requireLibrary();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const mod = moduleByKey(input.blockKey);
  if (!mod || !isVariantBlockKey(input.blockKey)) return { ok: false, error: "Texto inválido." };
  const base = input.baseBody.trim();
  if (!base) return { ok: false, error: "No hay texto base para adaptar." };
  // Para la IA: la descripción que se cargó en Configuración, o la de los rubros de antes, o el nombre.
  const audienceRow = input.audience ? await prisma.quoteAudience.findUnique({ where: { key: input.audience } }) : null;
  const audience = audienceRow ? { focus: audienceRow.focus || legacyAudience(audienceRow.key)?.focus || audienceRow.label } : null;
  const profile = input.profile && PROFILE_LABEL[input.profile] ? input.profile : null;
  const extra = (input.instruction ?? "").trim().slice(0, 1000);
  if (!audience && !profile && extra.length < 3) {
    return { ok: false, error: "Elegí a quién va, el tipo de presupuesto o escribí qué cambiar." };
  }
  if (!(await getQuoteOpenAI())) return { ok: false, error: "Falta la clave de OpenAI (Admin → API Keys)." };

  const lines = [
    audience ? `Adaptá el texto para un cliente de ${audience.focus}. Usá ejemplos y vocabulario de ese rubro solo donde sumen; no lo nombres en cada frase.` : null,
    profile === "resumido" ? "Es para el presupuesto Corto: dejalo en la mitad del largo o menos, con lo esencial." : null,
    profile === "premium" ? "Es para el presupuesto Completo: podés desarrollarlo un poco más, sin relleno." : null,
    profile === "tecnico" ? "Es para el presupuesto Estándar: mantené un largo parecido al actual." : null,
    extra ? `Además: ${extra}` : null,
    "No agregues clientes, obras, cifras, certificaciones ni servicios que no estén en el texto actual. Español rioplatense formal, frases cortas, sin frases hechas de marketing.",
  ].filter(Boolean);

  try {
    const body = await rewriteSectionBody({ title: mod.title, type: mod.key, body: base, instruction: lines.join("\n") });
    return { ok: true, body };
  } catch (e) {
    console.error("[quote-text-variants] borrador IA", e);
    return { ok: false, error: e instanceof Error ? e.message : "La IA no pudo escribir la versión." };
  }
}
