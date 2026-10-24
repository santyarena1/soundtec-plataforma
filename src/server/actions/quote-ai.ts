"use server";

import { QuoteAiCapability } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadQuoteForEdit, requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { QUOTE_OPENAI_MISSING_KEY, getQuoteOpenAI } from "@/lib/quote-llm";
import {
  describeGenerateResult,
  generateQuoteProposal,
  previewRewriteQuoteNode,
  rewriteQuoteNode,
  rewriteQuoteTemplateBlock,
} from "@/services/quote-orchestrator";
import { fillMissingShortDescriptions, regenerateProductShortDescription } from "@/lib/product-short-description";
import { recordQuoteSnapshot } from "@/lib/quote-edit-history";
import { revalidatePath } from "next/cache";

/**
 * `brief`: lo que está escrito en el campo en este momento. Si viene y es
 * distinto del guardado, se guarda antes de generar (antes «Generar» usaba el
 * brief viejo si no se apretaba «Guardar brief»).
 */
export async function generateQuoteFromBrief(
  quoteId: string,
  options: { brief?: string } = {}
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const loaded = await loadQuoteForEdit(quoteId);
  if (!loaded.quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };
  try {
    if (typeof options.brief === "string") {
      const brief = options.brief.slice(0, 20000);
      if (brief.trim() !== (loaded.quote.brief ?? "").trim()) {
        await prisma.quote.update({ where: { id: quoteId }, data: { brief: brief.trim() ? brief : null } });
      }
    }
    await recordQuoteSnapshot({
      quoteId,
      actorId: loaded.user.id,
      summary: "Antes de generar propuesta con IA",
    });
    const r = await generateQuoteProposal(quoteId, loaded.user.id);
    revalidatePath(`/admin/quotes/${quoteId}`);
    if (!r.ok) return r;
    const message = describeGenerateResult(r);
    // Nada escrito y algo falló: no es un éxito aunque las sugerencias se hayan guardado.
    if (r.written.length === 0 && r.failed.length > 0) return { ok: false, error: message };
    return { ok: true, message };
  } catch (e) {
    console.error("[quote-ai] generateQuoteFromBrief", e);
    const msg = e instanceof Error ? e.message : "Error al generar.";
    return { ok: false, error: msg };
  }
}

export async function previewReviseQuoteNode(input: {
  quoteId: string;
  nodeId: string;
  kind: "item" | "section";
  instruction: string;
}): Promise<{ ok: boolean; error?: string; body?: string; previousBody?: string }> {
  const loaded = await loadQuoteForEdit(input.quoteId);
  if (!loaded.quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };
  const instruction = input.instruction.trim();
  if (instruction.length < 3) return { ok: false, error: "Escribí una instrucción." };
  const oa = await getQuoteOpenAI();
  if (!oa) return { ok: false, error: QUOTE_OPENAI_MISSING_KEY };
  try {
    const result = await previewRewriteQuoteNode({ ...input, instruction });
    return { ok: true, body: result.body, previousBody: result.previousBody };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo generar la vista previa." };
  }
}

export async function reviseQuoteNode(input: {
  quoteId: string;
  nodeId: string;
  kind: "item" | "section";
  instruction: string;
}): Promise<{ ok: boolean; error?: string; message?: string; body?: string }> {
  const loaded = await loadQuoteForEdit(input.quoteId);
  if (!loaded.quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };
  const instruction = input.instruction.trim();
  if (instruction.length < 3) return { ok: false, error: "Escribí una instrucción." };

  const oa = await getQuoteOpenAI();
  if (!oa) {
    return { ok: false, error: QUOTE_OPENAI_MISSING_KEY };
  }
  try {
    await recordQuoteSnapshot({
      quoteId: input.quoteId,
      actorId: loaded.user.id,
      summary:
        input.kind === "section"
          ? `Antes de reescribir módulo con IA`
          : `Antes de reescribir ítem con IA`,
    });
    const body = await rewriteQuoteNode({ ...input, instruction });
    await prisma.quoteAiRun.create({
      data: {
        quoteId: input.quoteId,
        userId: loaded.user.id,
        capability: QuoteAiCapability.REVISE_NODE,
        provider: oa.provider,
        model: oa.model,
        nodeId: input.nodeId,
        instruction,
        accepted: true,
      },
    });
    revalidatePath(`/admin/quotes/${input.quoteId}`);
    return {
      ok: true,
      body,
      message:
        input.kind === "section"
          ? "Módulo reescrito. Sólo esta cotización; la plantilla maestra no cambia."
          : "Pieza reescrita. Si no cierra, fijala o volvé a pedir con otra instrucción.",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo reescribir." };
  }
}

export async function reviseQuoteTemplateBlock(input: {
  blockId: string;
  instruction: string;
}): Promise<{ ok: boolean; error?: string; message?: string; body?: string }> {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    return { ok: false, error: "No tenés permiso para editar la plantilla." };
  }
  const instruction = input.instruction.trim();
  if (instruction.length < 3) return { ok: false, error: "Escribí una instrucción." };
  if (!input.blockId) return { ok: false, error: "Módulo inválido." };

  const oa = await getQuoteOpenAI();
  if (!oa) {
    return { ok: false, error: QUOTE_OPENAI_MISSING_KEY };
  }
  try {
    const body = await rewriteQuoteTemplateBlock({ blockId: input.blockId, instruction });
    revalidatePath("/admin/settings/quotes/plantilla");
    revalidatePath("/admin/settings/quotes");
    return {
      ok: true,
      body,
      message: "Plantilla maestra actualizada. Las cotizaciones ya creadas no se tocan.",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo reescribir la plantilla.",
    };
  }
}

/**
 * Completa descripciones cortas faltantes de los productos de la planilla:
 * como máximo SHORT_DESCRIPTION_BATCH_LIMIT por pedido y en paralelo acotado.
 * La página lo llama por fetch (ruta API), no como server action, para no
 * trabar la cola de acciones del navegador mientras la IA responde.
 */
export async function ensureQuoteProductShortDescriptions(
  quoteId: string
): Promise<{ ok: boolean; filled?: number; failed?: number; remaining?: number; error?: string }> {
  const loaded = await loadQuoteForEdit(quoteId);
  if (!loaded.quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };
  const productIds = loaded.quote.items.map((item) => item.productId).filter((id): id is string => Boolean(id));
  if (productIds.length === 0) return { ok: true, filled: 0, failed: 0, remaining: 0 };
  try {
    const result = await fillMissingShortDescriptions(productIds);
    if (result.failed) console.error("[quote-ai] descripciones cortas sin generar", { quoteId, ...result });
    if (result.filled > 0) revalidatePath(`/admin/quotes/${quoteId}`);
    return { ok: true, ...result };
  } catch (error) {
    console.error("[quote-ai] ensureQuoteProductShortDescriptions", error);
    return { ok: false, filled: 0, error: "No se pudieron completar las descripciones cortas." };
  }
}

export async function regenerateQuoteProductShortDescription(input: {
  quoteId: string;
  productId: string;
}): Promise<{ ok: boolean; text?: string; error?: string }> {
  const loaded = await loadQuoteForEdit(input.quoteId);
  if (!loaded.quote) return { ok: false, error: loaded.blockedReason ?? "Sin acceso." };
  const onQuote = loaded.quote.items.some((item) => item.productId === input.productId);
  if (!onQuote) return { ok: false, error: "Ese producto no está en la planilla." };
  // Cambia la ficha del catálogo (la usan todas las cotizaciones): pide permiso de catálogo.
  const { permissions } = await getCurrentPermissions();
  if (!permissionsHave(permissions, "products.edit")) {
    return {
      ok: false,
      error: "Regenerar la descripción cambia la ficha del catálogo: hace falta permiso para editar productos.",
    };
  }
  try {
    const text = await regenerateProductShortDescription(input.productId);
    if (!text) return { ok: false, error: "La IA no devolvió una descripción utilizable; la ficha no se cambió." };
    revalidatePath(`/admin/quotes/${input.quoteId}`);
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${input.productId}`);
    revalidatePath(`/portal/products/${input.productId}`);
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo regenerar." };
  }
}
