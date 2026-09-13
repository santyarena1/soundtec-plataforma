"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { setSetting } from "@/lib/settings";
import { PRICING_KEYS } from "@/services/ai-assistant/usage";

function parsePrice(raw: string): number | null {
  const value = Number(String(raw).replace(",", ".").trim());
  if (!Number.isFinite(value) || value < 0 || value > 1000) return null;
  return value;
}

/** Tarifa del modelo en USD por millón de tokens, declarada por el admin. */
export async function saveAssistantPricing(input: {
  inputPerMillion: string;
  outputPerMillion: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const inputPrice = parsePrice(input.inputPerMillion);
  const outputPrice = parsePrice(input.outputPerMillion);
  if (inputPrice === null || outputPrice === null) {
    return { ok: false, error: "Poné un precio válido en dólares, por ejemplo 0.15" };
  }

  await Promise.all([
    setSetting(PRICING_KEYS.input, String(inputPrice), {
      description: "USD por millón de tokens de entrada del asistente de productos",
    }),
    setSetting(PRICING_KEYS.output, String(outputPrice), {
      description: "USD por millón de tokens de salida del asistente de productos",
    }),
  ]);

  revalidatePath("/admin/assistant/conversations");
  return { ok: true };
}
