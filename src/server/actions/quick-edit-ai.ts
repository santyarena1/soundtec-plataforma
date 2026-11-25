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
import { isAiRefusal, isLongDescriptionPlaceholder } from "@/lib/quick-edit/content";
import { requireQuickEdit } from "@/server/quick-edit/shared";

export type AiDraftResult = { ok: true; text: string } | { ok: false; error: string };

const NO_KEY = "No hay clave de IA configurada: cargala en Configuración › Integraciones (OpenAI) y probá de nuevo.";
const FAILED = "La IA no pudo generar el texto. Probá de nuevo en unos segundos.";
const NO_DATA = "La IA no encontró datos suficientes de este producto para escribir una descripción confiable. Completá la descripción corta o las especificaciones y probá de nuevo, o escribila a mano.";

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
    include: { brand: { select: { name: true } }, category: { select: { name: true } } },
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
    if (!text.trim()) return { ok: false, error: FAILED };
    return isAiRefusal(text) ? { ok: false, error: NO_DATA } : { ok: true, text: text.trim() };
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
    const text = await generateLongDescription({
      name: ctx.name,
      brand: ctx.product.brand?.name,
      category: ctx.product.category?.name,
      short: ctx.short.trim() || undefined,
    });
    if (isLongDescriptionPlaceholder(text)) return { ok: false, error: FAILED };
    return isAiRefusal(text) ? { ok: false, error: NO_DATA } : { ok: true, text: text.trim() };
  } catch (error) {
    console.error("[quick-edit] IA descripción larga", error);
    return { ok: false, error: FAILED };
  }
}
