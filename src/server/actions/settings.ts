"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { setSetting } from "@/lib/settings";
import { SETTINGS_REVALIDATE_PATHS } from "@/lib/settings-sections";

/** Refresca el hub de configuración y las pantallas que consumen settings. */
function revalidateSettings(extra: string[] = []) {
  for (const path of [...SETTINGS_REVALIDATE_PATHS, ...extra]) revalidatePath(path);
}

const setSchema = z.object({
  key: z.string().min(1).max(120),
  value: z.string().max(8000).default(""),
  isSecret: z.string().optional(),
});

const SECRET_PREFIXES = ["openai.", "serper.", "anthropic.", "gemini.", "images.api", "higgsfield."];

export async function saveSetting(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = setSchema.safeParse({
    key: formData.get("key"),
    value: formData.get("value") || "",
    isSecret: String(formData.get("isSecret") || ""),
  });
  if (!parsed.success) return;
  const secret =
    parsed.data.isSecret === "true" || SECRET_PREFIXES.some((p) => parsed.data.key.startsWith(p) && parsed.data.key.includes("key"));
  // Una clave vacía no borra la guardada: el campo ya no viene precargado.
  if (secret && !parsed.data.value.trim()) return;
  await setSetting(parsed.data.key, parsed.data.value.trim(), secret ? { isSecret: true } : undefined);
  revalidateSettings(["/admin/crestron-sync", "/admin/quotes"]);
}

export interface SaveSettingState {
  ok: boolean;
  message: string;
}

/** Igual que saveSetting pero devuelve qué pasó, para que el formulario lo muestre. */
export async function saveSettingWithFeedback(_prev: SaveSettingState | null, formData: FormData): Promise<SaveSettingState> {
  await requireAdmin();
  const parsed = setSchema.safeParse({
    key: formData.get("key"),
    value: formData.get("value") || "",
    isSecret: String(formData.get("isSecret") || ""),
  });
  if (!parsed.success) return { ok: false, message: "El valor no es válido (máximo 8000 caracteres)." };
  const secret =
    parsed.data.isSecret === "true" || SECRET_PREFIXES.some((p) => parsed.data.key.startsWith(p) && parsed.data.key.includes("key"));
  const value = parsed.data.value.trim();
  if (secret && !value) return { ok: false, message: "Pegá la clave nueva en el campo antes de guardar." };
  try {
    await setSetting(parsed.data.key, value, secret ? { isSecret: true } : undefined);
  } catch (error) {
    console.error("saveSetting failed", parsed.data.key, error);
    return { ok: false, message: "No se pudo guardar. Probá de nuevo; si sigue, avisame." };
  }
  revalidateSettings(["/admin/crestron-sync", "/admin/quotes"]);
  return { ok: true, message: secret ? `Clave guardada (termina en ${value.slice(-4)}).` : "Guardado." };
}

const bulkSchema = z.record(z.string(), z.string());

export async function saveBulkSettings(input: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  for (const [key, value] of Object.entries(parsed.data)) {
    await setSetting(key, value);
  }
  revalidateSettings();
  return { ok: true };
}

export async function uploadBrandLogo(formData: FormData): Promise<void> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) return;
  if (file.size === 0) return;
  if (file.size > 500 * 1024) return; // 500KB max para almacenar en DB
  if (!file.type.startsWith("image/")) return;

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = file.type || "image/png";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  await setSetting("branding.logo_url", dataUrl);
  revalidateSettings(["/"]);
}
