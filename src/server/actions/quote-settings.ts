"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { setSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";

/**
 * Configuración de cotizaciones: cada tarjeta se guarda con un solo botón
 * (antes cada campo tenía su propio «Guardar») y las imágenes de identidad se
 * suben como archivo (antes había que escribir la ruta).
 */

type Result = { ok: true; saved?: number } | { ok: false; error: string };

const EDITABLE_KEYS = new Set<string>(Object.values(QUOTE_SETTING_KEYS).filter((key) => key.startsWith("quotes.")));

/** Claves que solo aceptan ciertos valores. */
const ALLOWED_VALUES: Record<string, string[]> = {
  [QUOTE_SETTING_KEYS.defaultProfile]: ["resumido", "tecnico", "premium"],
  [QUOTE_SETTING_KEYS.defaultTaxMode]: ["NOTE", "ADDED", "NONE"],
  [QUOTE_SETTING_KEYS.includeDate]: ["true", "false"],
  [QUOTE_SETTING_KEYS.showDeliveryDefault]: ["true", "false"],
  [QUOTE_SETTING_KEYS.brandsDisplayMode]: ["collage", "individual"],
};
const NUMERIC_KEYS: Record<string, { min: number; max: number }> = {
  [QUOTE_SETTING_KEYS.defaultIva]: { min: 0, max: 100 },
  [QUOTE_SETTING_KEYS.validityDays]: { min: 1, max: 365 },
  [QUOTE_SETTING_KEYS.padding]: { min: 1, max: 10 },
  [QUOTE_SETTING_KEYS.nextSequence]: { min: 1, max: 99_999_999 },
};

async function guard(): Promise<Result | null> {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    return { ok: false, error: "No tenés permiso para cambiar la configuración de cotizaciones." };
  }
  return null;
}

function refresh() {
  revalidatePath("/admin/settings/quotes");
  revalidatePath("/admin/quotes");
}

/** Guarda todos los campos de una tarjeta. Los inputs se llaman `setting:<clave>`. */
export async function saveQuoteSettingsBatch(formData: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  const updates: Array<[string, string]> = [];
  for (const [name, raw] of formData.entries()) {
    if (!name.startsWith("setting:") || typeof raw !== "string") continue;
    const key = name.slice("setting:".length);
    if (!EDITABLE_KEYS.has(key)) return { ok: false, error: "Hay un campo que no se puede editar desde acá." };
    const value = raw.trim();
    const allowed = ALLOWED_VALUES[key];
    if (allowed && !allowed.includes(value)) return { ok: false, error: "Hay una opción inválida." };
    const range = NUMERIC_KEYS[key];
    if (range) {
      const n = Number(value.replace(",", "."));
      if (!Number.isFinite(n) || n < range.min || n > range.max) return { ok: false, error: `Un número está fuera de rango (${range.min}–${range.max}).` };
    }
    updates.push([key, value]);
  }
  for (const [key, value] of updates) {
    await setSetting(key, value, { description: "Configuración del módulo de cotizaciones" });
  }
  refresh();
  return { ok: true, saved: updates.length };
}

const IDENTITY_IMAGE_KEYS = new Set<string>([
  QUOTE_SETTING_KEYS.companyLogoUrl,
  QUOTE_SETTING_KEYS.companyHeaderUrl,
  QUOTE_SETTING_KEYS.companyBrandsUrl,
  QUOTE_SETTING_KEYS.companyIsoUrl,
]);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Sube una imagen de identidad (logo, pie, collage de marcas, sellos) y la deja como la vigente. */
export async function uploadQuoteIdentityImage(key: string, formData: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  if (!IDENTITY_IMAGE_KEYS.has(key)) return { ok: false, error: "Imagen inválida." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elegí un archivo." };
  if (!IMAGE_TYPES.has(file.type)) return { ok: false, error: "Tiene que ser PNG, JPG, WEBP, GIF o SVG." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "La imagen pesa más de 4 MB." };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { ok: false, error: "El almacenamiento de archivos no está configurado." };
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const blob = await put(`quotes/identity/${key.replace(/\W+/g, "-")}-${Date.now()}.${extension}`, Buffer.from(await file.arrayBuffer()), {
    access: "public",
    contentType: file.type,
  });
  await setSetting(key, blob.url, { description: "Imagen de identidad del documento de cotización" });
  refresh();
  return { ok: true };
}

/** Vuelve a la imagen original de la plantilla. */
export async function resetQuoteIdentityImage(key: string): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;
  if (!IDENTITY_IMAGE_KEYS.has(key)) return { ok: false, error: "Imagen inválida." };
  await setSetting(key, "", { description: "Imagen de identidad del documento de cotización" });
  refresh();
  return { ok: true };
}
