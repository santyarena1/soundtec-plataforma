"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { setSetting } from "@/lib/settings";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

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
  return { ok: true };
}

export async function uploadBrandLogo(formData: FormData): Promise<void> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) return;
  if (file.size === 0) return;
  if (file.size > 5 * 1024 * 1024) return; // 5MB
  if (!file.type.startsWith("image/")) return;

  const extFromName = path.extname(file.name || "").toLowerCase();
  const ext = [".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(extFromName) ? extFromName : ".png";

  const uploadsDir = path.join(process.cwd(), "public", "uploads", "logos");
  await mkdir(uploadsDir, { recursive: true });

  const fileName = `logo-${Date.now()}-${randomUUID()}${ext}`;
  const outputPath = path.join(uploadsDir, fileName);
  const bytes = await file.arrayBuffer();
  await writeFile(outputPath, Buffer.from(bytes));

  await setSetting("branding.logo_url", `/uploads/logos/${fileName}`);
  revalidatePath("/");
  revalidatePath("/admin/branding");
  revalidatePath("/admin/settings");
}
