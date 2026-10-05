"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { LOGO_MIME_TYPES, MAX_LOGO_BYTES } from "@/lib/brand-logo";

export type LogoResult = { ok: true } | { ok: false; error: string };

const FETCH_TIMEOUT_MS = 8000;

function revalidateBrandViews(): void {
  revalidatePath("/admin/brands");
  revalidatePath("/catalogo");
  revalidatePath("/portal/products");
}

/**
 * Verifica que una URL sea una imagen accesible (no una página web).
 * Solo http(s) y sin hosts locales.
 */
export async function checkImageUrl(raw: string): Promise<LogoResult> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "La URL no es válida." };
  }
  if (!/^https?:$/.test(url.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(url.hostname)) {
    return { ok: false, error: "Usá una URL pública (https://…)." };
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok) return { ok: false, error: `La URL respondió con error ${res.status}.` };
    if (!type.startsWith("image/")) {
      return {
        ok: false,
        error: "Esa URL es una página web, no una imagen. Abrí el logo, hacé clic derecho → «Copiar dirección de imagen», o subí el archivo.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo abrir la URL. Probá subir el archivo." };
  }
}

export async function saveBrandLogoUrl(brandId: string, rawUrl: string): Promise<LogoResult> {
  await requireAdmin();
  const check = await checkImageUrl(rawUrl);
  if (!check.ok) return check;
  await prisma.brand.update({ where: { id: brandId }, data: { logoUrl: rawUrl.trim() } });
  revalidateBrandViews();
  return { ok: true };
}

/** Sube el archivo del logo (PNG, JPG, SVG, WEBP, GIF o AVIF, hasta 1 MB). */
export async function uploadBrandLogoFile(brandId: string, formData: FormData): Promise<LogoResult> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elegí un archivo." };
  if (file.size > MAX_LOGO_BYTES) return { ok: false, error: "El logo pesa más de 1 MB." };
  const isSvgByName = /\.svg$/i.test(file.name);
  const mime = (file.type || (isSvgByName ? "image/svg+xml" : "")).toLowerCase();
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(mime)) {
    return { ok: false, error: "Formato no soportado. Usá PNG, JPG, SVG, WEBP, GIF o AVIF." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (mime === "image/svg+xml" && !/<svg[\s>]/i.test(bytes.toString("utf8", 0, Math.min(bytes.length, 4096)))) {
    return { ok: false, error: "El archivo SVG no es válido." };
  }
  await prisma.brand.update({
    where: { id: brandId },
    data: { logoUrl: `data:${mime};base64,${bytes.toString("base64")}` },
  });
  revalidateBrandViews();
  return { ok: true };
}

/** Muestra u oculta la marca (y sus productos) en el catálogo público, el portal y el stand. */
export async function toggleBrandCatalogVisibility(brandId: string, _formData?: FormData): Promise<void> {
  await requireAdmin();
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { hiddenFromCatalog: true } });
  if (!brand) return;
  await prisma.brand.update({ where: { id: brandId }, data: { hiddenFromCatalog: !brand.hiddenFromCatalog } });
  revalidateBrandViews();
}

export async function removeBrandLogo(brandId: string): Promise<LogoResult> {
  await requireAdmin();
  await prisma.brand.update({ where: { id: brandId }, data: { logoUrl: null } });
  revalidateBrandViews();
  return { ok: true };
}
