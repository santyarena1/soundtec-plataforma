"use server";

import { QuoteAiCapability } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser, requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { getQuoteOpenAI } from "@/lib/quote-llm";
import { generateQuoteProposal, rewriteQuoteNode, rewriteQuoteTemplateBlock } from "@/services/quote-orchestrator";
import { fillMissingShortDescription } from "@/lib/product-short-description";
import { revalidatePath } from "next/cache";

export async function generateQuoteFromBrief(quoteId: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  try {
    const r = await generateQuoteProposal(quoteId, loaded.user.id);
    revalidatePath(`/admin/quotes/${quoteId}`);
    if (!r.ok) return r;
    return { ok: true, message: "Propuesta armada. Revisá ítems y textos; fijá lo que esté bien." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al generar.";
    return { ok: false, error: msg };
  }
}

export async function reviseQuoteNode(input: {
  quoteId: string;
  nodeId: string;
  kind: "item" | "section";
  instruction: string;
}): Promise<{ ok: boolean; error?: string; message?: string; body?: string }> {
  const loaded = await loadQuoteForUser(input.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "COT emitida." };
  const instruction = input.instruction.trim();
  if (instruction.length < 3) return { ok: false, error: "Escribí una instrucción." };

  const oa = await getQuoteOpenAI();
  if (!oa) {
    return { ok: false, error: "Cargá OpenAI API Key en Admin → API Keys." };
  }
  try {
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
    return { ok: false, error: "Cargá OpenAI API Key en Admin → API Keys." };
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

export async function ensureQuoteProductShortDescriptions(
  quoteId: string
): Promise<{ ok: boolean; filled?: number; error?: string }> {
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  const productIds = [
    ...new Set(loaded.quote.items.map((item) => item.productId).filter((id): id is string => Boolean(id))),
  ];
  if (productIds.length === 0) return { ok: true, filled: 0 };

  const missing = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      OR: [{ shortDescription: null }, { shortDescription: "" }],
    },
    select: { id: true },
  });

  let filled = 0;
  for (const product of missing) {
    try {
      const text = await fillMissingShortDescription(product.id);
      if (text) filled += 1;
    } catch {
      /* sigue con el resto */
    }
  }
  if (filled > 0) revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true, filled };
}
