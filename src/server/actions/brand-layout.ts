"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth-helpers";
import { setSetting } from "@/lib/settings";
import { BRAND_LAYOUT_SETTING_KEY, validateBrandGroups } from "@/lib/brand-layout";

/** Guarda los grupos de marcas del catálogo (Admin › Marcas). `null` vuelve al boceto por defecto. */
export async function saveBrandGroups(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff("brands.manage");
  let value = "";
  if (input !== null) {
    const checked = validateBrandGroups(input);
    if (!checked.ok) return checked;
    value = JSON.stringify(checked.config);
  }
  await setSetting(BRAND_LAYOUT_SETTING_KEY, value, { isSecret: false, description: "Grupos de marcas del catálogo: principal + hermanas y su orden (Admin › Marcas)." });
  revalidatePath("/portal/products");
  revalidatePath("/portal");
  revalidatePath("/catalogo");
  revalidatePath("/admin/brands");
  return { ok: true };
}
