"use server";

import { QuoteAiCapability } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser } from "@/lib/quote-access";
import { getQuoteOpenAI } from "@/lib/quote-llm";
import { generateQuoteProposal, rewriteQuoteNode } from "@/services/quote-orchestrator";
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
}): Promise<{ ok: boolean; error?: string; message?: string }> {
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
    await rewriteQuoteNode(input);
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
    return { ok: true, message: "Pieza reescrita. Si no cierra, fijala o volvé a pedir con otra instrucción." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo reescribir." };
  }
}
