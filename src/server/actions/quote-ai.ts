"use server";

import { QuoteAiCapability, QuoteNodeSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser } from "@/lib/quote-access";
import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { revalidatePath } from "next/cache";

function firstConfiguredProvider() {
  return Promise.all([
    getSetting(QUOTE_SETTING_KEYS.openaiKey, process.env.OPENAI_API_KEY || ""),
    getSetting(QUOTE_SETTING_KEYS.anthropicKey, process.env.ANTHROPIC_API_KEY || ""),
    getSetting(QUOTE_SETTING_KEYS.geminiKey, process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""),
  ]).then(([openai, anthropic, gemini]) => {
    if (openai) return { provider: "openai", key: openai };
    if (anthropic) return { provider: "anthropic", key: anthropic };
    if (gemini) return { provider: "gemini", key: gemini };
    return null;
  });
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

  if (input.kind === "item") {
    const item = loaded.quote.items.find((i) => i.id === input.nodeId);
    if (!item) return { ok: false, error: "Ítem no encontrado." };
    if (item.locked) return { ok: false, error: "Ítem fijado." };
    await prisma.quoteItem.update({
      where: { id: item.id },
      data: { lastInstruction: instruction },
    });
  } else {
    const section = loaded.quote.sections.find((s) => s.id === input.nodeId);
    if (!section) return { ok: false, error: "Sección no encontrada." };
    if (section.locked) return { ok: false, error: "Sección fijada." };
    await prisma.quoteSection.update({
      where: { id: section.id },
      data: { lastInstruction: instruction, source: QuoteNodeSource.GENERATED },
    });
  }

  const configured = await firstConfiguredProvider();
  await prisma.quoteAiRun.create({
    data: {
      quoteId: input.quoteId,
      userId: loaded.user.id,
      capability: QuoteAiCapability.REVISE_NODE,
      provider: configured?.provider ?? "none",
      model: configured ? await getSetting(QUOTE_SETTING_KEYS.writerModel, "") : null,
      nodeId: input.nodeId,
      instruction,
      output: { status: configured ? "queued" : "missing_api_key" },
    },
  });

  revalidatePath(`/admin/quotes/${input.quoteId}`);
  if (!configured) {
    return {
      ok: true,
      message:
        "Instrucción guardada. Falta API key (OpenAI / Anthropic / Gemini) en Configuración → API Keys para que la IA reescriba esta pieza.",
    };
  }
  return {
    ok: true,
    message: "Instrucción registrada. El redactor de esta pieza se conecta con la clave configurada (próximo paso del orquestador).",
  };
}
