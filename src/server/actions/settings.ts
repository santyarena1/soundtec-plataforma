"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { setSetting } from "@/lib/settings";

const setSchema = z.object({
  key: z.string().min(1).max(120),
  value: z.string().max(8000).default(""),
});

export async function saveSetting(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = setSchema.safeParse({
    key: formData.get("key"),
    value: formData.get("value") || "",
  });
  if (!parsed.success) return;
  await setSetting(parsed.data.key, parsed.data.value);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/branding");
  revalidatePath("/admin/api-keys");
  revalidatePath("/admin/ai");
}

const bulkSchema = z.record(z.string(), z.string());

export async function saveBulkSettings(input: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  for (const [key, value] of Object.entries(parsed.data)) {
    await setSetting(key, value);
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/branding");
  revalidatePath("/admin/api-keys");
  revalidatePath("/admin/ai");
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
  revalidatePath("/");
  revalidatePath("/admin/branding");
  revalidatePath("/admin/settings");
}
