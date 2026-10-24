"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-helpers";
import { setSetting } from "@/lib/settings";

/**
 * «Precios y moneda»: solo los valores que el motor de precios usa de verdad.
 * (Antes la pantalla guardaba margen global, COEF NAC global y un TC que nadie leía.)
 */
const schema = z.object({
  defaultMarkup: z
    .number({ invalid_type_error: "El markup tiene que ser un número." })
    .gt(1, "El markup por defecto tiene que ser mayor a 1 (si no, se vende al costo).")
    .max(20, "Máximo ×20."),
  tcSource: z.enum(["blue", "oficial", "mep"]),
  tcFallback: z.number().positive("El dólar de respaldo tiene que ser mayor a 0.").max(1_000_000).nullable(),
});

const num = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").trim().replace(/\./g, (m, i, all: string) => (all.includes(",") ? "" : m)).replace(",", ".");
  return text ? Number(text) : null;
};

export async function savePricingSettings(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("settings.manage");
  const parsed = schema.safeParse({
    defaultMarkup: num(formData.get("defaultMarkup")),
    tcSource: String(formData.get("tcSource") || ""),
    tcFallback: num(formData.get("tcFallback")),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  await setSetting("pricing.default_markup", String(parsed.data.defaultMarkup), { description: "Markup por defecto cuando no hay regla de margen ni COEF VTA." });
  await setSetting("pricing.tc_source", parsed.data.tcSource, { description: "Dólar de referencia para los precios en pesos." });
  await setSetting("pricing.tc", parsed.data.tcFallback == null ? "" : String(parsed.data.tcFallback), { description: "Dólar de respaldo si falla la consulta en internet." });
  for (const path of ["/admin/settings/pricing", "/admin/products", "/portal/products", "/catalogo"]) revalidatePath(path);
  return { ok: true };
}
