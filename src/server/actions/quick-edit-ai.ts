"use server";

/**
 * Botones de IA de la pestaña Textos de la edición rápida. Usan los mismos
 * generadores (y los mismos prompts editables) que la ficha del admin
 * (src/services/openai.ts), pero NO guardan: devuelven el texto para que el
 * equipo lo revise y lo guarde con «Guardar textos».
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateLongDescription, generateShortDescription, getOpenAiClient } from "@/services/openai";
import { AI_NO_DATA_ERROR, checkAiDescription } from "@/lib/ai-text-guard";
import { DESCRIPTION_PRODUCT_INCLUDE, longDescriptionInput } from "@/lib/ai-description-context";
import { requireQuickEdit } from "@/server/quick-edit/shared";

export type AiDraftResult = { ok: true; text: string } | { ok: false; error: string };

const NO_KEY = "No hay clave de IA configurada: cargala en Configuración › Integraciones (OpenAI) y probá de nuevo.";
const FAILED = "La IA no pudo generar el texto. Probá de nuevo en unos segundos.";
const NO_DATA = AI_NO_DATA_ERROR;

function toDraft(text: string): AiDraftResult {
  const verdict = checkAiDescription(text);
  if (verdict.ok) return { ok: true, text: verdict.text };
  return { ok: false, error: verdict.reason === "no_data" ? NO_DATA : FAILED };
}

const inputSchema = z.object({
  productId: z.string().min(1).max(64),
  /** Lo que hay escrito en el panel (puede no estar guardado): mejor contexto para la IA. */
  name: z.string().max(280).optional(),
  shortDescription: z.string().max(500).optional(),
  longDescription: z.string().max(20000).optional(),
});

async function loadContext(input: z.input<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return null;
  const p = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    include: DESCRIPTION_PRODUCT_INCLUDE,
  });
  if (!p) return null;
  return {
    product: p,
    name: parsed.data.name?.trim() || p.normalizedName,
    short: parsed.data.shortDescription ?? p.shortDescription ?? "",
    long: parsed.data.longDescription ?? p.longDescription ?? "",
  };
}

/** Descripción corta con IA (mismos datos que «Generar con IA» de la ficha del admin). No guarda. */
export async function draftQuickEditShortDescription(input: z.input<typeof inputSchema>): Promise<AiDraftResult> {
  await requireQuickEdit();
  const ctx = await loadContext(input);
  if (!ctx) return { ok: false, error: "Producto no encontrado." };
  if (!(await getOpenAiClient())) return { ok: false, error: NO_KEY };
  try {
    const text = await generateShortDescription({
      name: ctx.name,
      brand: ctx.product.brand?.name,
      category: ctx.product.category?.name,
      avoid: ctx.short.trim() || undefined,
      facts: {
        modelNumber: ctx.product.modelNumber,
        specifications: ctx.product.specifications,
        keyFeatures: ctx.product.keyFeatures,
        longDescription: ctx.long || null,
      },
      noFallback: true,
    });
    return toDraft(text);
  } catch (error) {
    console.error("[quick-edit] IA descripción corta", error);
    return { ok: false, error: FAILED };
  }
}

/** Descripción larga con IA (mismo generador que la ficha del admin). No guarda. */
export async function draftQuickEditLongDescription(input: z.input<typeof inputSchema>): Promise<AiDraftResult> {
  await requireQuickEdit();
  const ctx = await loadContext(input);
  if (!ctx) return { ok: false, error: "Producto no encontrado." };
  if (!(await getOpenAiClient())) return { ok: false, error: NO_KEY };
  try {
    // Lo escrito en el panel (nombre, corta) manda sobre lo guardado.
    const text = await generateLongDescription(longDescriptionInput(ctx.product, { name: ctx.name, short: ctx.short }));
    return toDraft(text);
  } catch (error) {
    console.error("[quick-edit] IA descripción larga", error);
    return { ok: false, error: FAILED };
  }
}
