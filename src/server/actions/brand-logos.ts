"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { LOGO_MIME_TYPES, MAX_LOGO_BYTES, isDataUrl, parseLogoDataUrl } from "@/lib/brand-logo";
import { normalizeLogo } from "@/server/brand-logo-normalize";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { checkRemoteImageUrl, isPrivateIp } from "@/lib/remote-image/url-guard";

export type LogoResult = { ok: true } | { ok: false; error: string };

const FETCH_TIMEOUT_MS = 8000;

function revalidateBrandViews(): void {
  revalidatePath("/admin/brands");
  revalidatePath("/catalogo");
  revalidatePath("/portal/products");
}

const MAX_REDIRECTS = 3;

/** La URL apunta a un host público (también después de resolver el DNS): el servidor no consulta la red interna. */
async function publicImageUrl(raw: string): Promise<URL | null> {
  const check = checkRemoteImageUrl(raw);
  if (!check.ok) return null;
  const host = check.url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return check.url;
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.length && addresses.every((a) => !isPrivateIp(a.address)) ? check.url : null;
  } catch {
    return null;
  }
}

/**
 * Verifica que una URL sea una imagen accesible (no una página web).
 * Solo http(s) públicos: cada redirección se vuelve a validar (protección SSRF).
 */
export async function checkImageUrl(raw: string): Promise<LogoResult> {
  await requireStaff("brands.manage");
  const first = await publicImageUrl(String(raw ?? ""));
  if (!first) return { ok: false, error: "Usá una URL pública (https://…)." };
  let url: URL = first;
  try {
    for (let hop = 0; ; hop++) {
      const res: Response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "manual" });
      const location: string | null = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (location) {
        const next: URL | null = hop < MAX_REDIRECTS ? await publicImageUrl(new URL(location, url).toString()) : null;
        if (!next) return { ok: false, error: "La URL redirige a una dirección que no se puede usar. Probá subir el archivo." };
        url = next;
        continue;
      }
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      await res.body?.cancel().catch(() => undefined);
      if (!res.ok) return { ok: false, error: `La URL respondió con error ${res.status}.` };
      if (!type.startsWith("image/")) {
        return {
          ok: false,
          error: "Esa URL es una página web, no una imagen. Abrí el logo, hacé clic derecho → «Copiar dirección de imagen», o subí el archivo.",
        };
      }
      return { ok: true };
    }
  } catch {
    return { ok: false, error: "No se pudo abrir la URL. Probá subir el archivo." };
  }
}

export async function saveBrandLogoUrl(brandId: string, rawUrl: string): Promise<LogoResult> {
  await requireStaff("brands.manage");
  const check = await checkImageUrl(rawUrl);
  if (!check.ok) return check;
  await prisma.brand.update({ where: { id: brandId }, data: { logoUrl: rawUrl.trim() } });
  revalidateBrandViews();
  return { ok: true };
}

/** Sube el archivo del logo (PNG, JPG, SVG, WEBP, GIF o AVIF, hasta 1 MB). */
export async function uploadBrandLogoFile(brandId: string, formData: FormData): Promise<LogoResult> {
  await requireStaff("brands.manage");
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
  // Se recorta el margen vacío y se lleva a un tamaño común (todos los logos parejos).
  let png: Buffer;
  try {
    png = await normalizeLogo(bytes, mime);
  } catch {
    return { ok: false, error: "No se pudo leer la imagen. Probá con otro archivo." };
  }
  await prisma.brand.update({
    where: { id: brandId },
    data: { logoUrl: `data:image/png;base64,${png.toString("base64")}` },
  });
  revalidateBrandViews();
  return { ok: true };
}

/** Muestra u oculta la marca (y sus productos) en el catálogo público, el portal y el stand. */
export async function toggleBrandCatalogVisibility(brandId: string, _formData?: FormData): Promise<void> {
  await requireStaff("brands.manage");
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { hiddenFromCatalog: true } });
  if (!brand) return;
  await prisma.brand.update({ where: { id: brandId }, data: { hiddenFromCatalog: !brand.hiddenFromCatalog } });
  revalidateBrandViews();
}

export async function removeBrandLogo(brandId: string): Promise<LogoResult> {
  await requireStaff("brands.manage");
  await prisma.brand.update({ where: { id: brandId }, data: { logoUrl: null } });
  revalidateBrandViews();
  return { ok: true };
}

/**
 * Normaliza todos los logos cargados (subidos o por URL): recorta márgenes y
 * los lleva al mismo tamaño. Los de URL se descargan y quedan guardados.
 */
export async function normalizeAllBrandLogos(): Promise<{ ok: true; updated: number; failed: string[] }> {
  await requireStaff("brands.manage");
  const brands = await prisma.brand.findMany({ where: { logoUrl: { not: null } }, select: { id: true, name: true, logoUrl: true } });
  let updated = 0;
  const failed: string[] = [];
  for (const brand of brands) {
    try {
      let source: { mime: string; bytes: Buffer } | null = null;
      if (isDataUrl(brand.logoUrl)) {
        source = parseLogoDataUrl(brand.logoUrl);
      } else if (brand.logoUrl && (await checkImageUrl(brand.logoUrl)).ok) {
        const res = await fetch(brand.logoUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length <= MAX_LOGO_BYTES * 4) source = { mime, bytes };
      }
      if (!source) {
        failed.push(brand.name);
        continue;
      }
      const png = await normalizeLogo(source.bytes, source.mime);
      await prisma.brand.update({ where: { id: brand.id }, data: { logoUrl: `data:image/png;base64,${png.toString("base64")}` } });
      updated++;
    } catch {
      failed.push(brand.name);
    }
  }
  revalidateBrandViews();
  return { ok: true, updated, failed };
}
