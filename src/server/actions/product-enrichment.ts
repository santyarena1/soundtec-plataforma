"use server";

import { BLOB_NOT_CONFIGURED, BLOB_UPLOAD_FAILED, isBlobConfigured } from "@/lib/blob-storage";
import { ImageRejectError } from "@/lib/remote-image/reasons";
import { MAX_DOWNLOAD_BYTES } from "@/server/remote-image/download";
import { normalizeProductImage, type NormalizedImage } from "@/server/remote-image/normalize";
import { importRemoteProductImage, storeNormalizedImage } from "@/server/remote-image/product-image-import";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireStaff } from "@/lib/auth-helpers";
import { generateLongDescription, generateShortDescription, suggestProductClassification, type ClassificationSuggestion } from "@/services/openai";
import { loadActiveRubros, suggestRubroForProduct, type RubroSuggestion } from "@/server/categories/ai-rubro";
import { matchRubroPath } from "@/lib/ai-rubro-path";
import { tangoPathLabel } from "@/lib/tango-tree";
import { searchProductImages, searchProductImagesOrError, type SerperImage } from "@/services/serper";
import { getSetting, setSetting } from "@/lib/settings";
import { moveProductImageFirst } from "@/server/catalog/product-gallery";
import { GALLERY_IMAGE_ORDER } from "@/lib/product-media";

function revalidateProductImages(productId: string) {
  if (productId) {
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath(`/portal/products/${productId}`);
  }
  revalidatePath("/admin/products");
  revalidatePath("/portal/products");
}

/** Si hay fotos pero ninguna es principal, marca la primera de la galería. El listado la usa de tapa. */
async function ensureProductHasPrimaryImage(productId: string) {
  if (!productId) return;
  const primary = await prisma.productImage.findFirst({
    where: { productId, isPrimary: true },
    select: { id: true },
  });
  if (primary) return;
  const first = await prisma.productImage.findFirst({
    where: { productId },
    orderBy: GALLERY_IMAGE_ORDER,
    select: { id: true },
  });
  if (!first) return;
  await prisma.productImage.update({ where: { id: first.id }, data: { isPrimary: true } });
}

// ── AI prompt settings (editables por el admin desde la ficha de producto) ──

const PROMPT_KEYS = {
  short: "ai.prompt.short_description",
  long: "ai.prompt.long_description",
} as const;

export async function loadAiPrompts(): Promise<{
  short: string;
  long: string;
  defaults: { short: string; long: string };
}> {
  await requireAdmin();
  const defaults = {
    short: "Sos un copywriter técnico B2B para productos audiovisuales profesionales. Escribís en español, neutro y conciso.",
    long: "Sos un copywriter técnico B2B para productos audiovisuales profesionales. Escribís en español, neutro, claro, sin marketing barato.",
  };
  const [shortP, longP] = await Promise.all([
    getSetting(PROMPT_KEYS.short, ""),
    getSetting(PROMPT_KEYS.long, ""),
  ]);
  return { short: shortP, long: longP, defaults };
}

export async function saveAiPrompts(input: {
  short?: string;
  long?: string;
}): Promise<{ ok: boolean }> {
  await requireAdmin();
  if (typeof input.short === "string") {
    await setSetting(PROMPT_KEYS.short, input.short.trim(), {
      description: "Prompt de sistema para generar descripciones cortas con IA",
    });
  }
  if (typeof input.long === "string") {
    await setSetting(PROMPT_KEYS.long, input.long.trim(), {
      description: "Prompt de sistema para generar descripciones largas con IA",
    });
  }
  return { ok: true };
}

/** Sugerencia de la ficha: marca del catálogo y rubro como ruta del árbol de Tango (nunca uno nuevo). */
export interface ProductClassificationSuggestion {
  brand: ClassificationSuggestion["brand"];
  category: RubroSuggestion | null;
  /** De dónde salió el rubro, o por qué no hay. */
  categoryNote: string;
  rationale?: string;
}

export async function suggestClassificationAction(
  productId: string
): Promise<{ ok: boolean; suggestion?: ProductClassificationSuggestion; error?: string }> {
  await requireStaff("products.edit", { costs: true });
  const [p, brands] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, include: { brand: { select: { name: true } } } }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  if (!p) return { ok: false, error: "Producto no encontrado." };

  const [brandSuggestion, rubro] = await Promise.all([
    // Solo la marca sale de acá: el rubro lo resuelve suggestRubroForProduct (equivalencia o ruta del árbol).
    suggestProductClassification({
      productName: p.normalizedName,
      productSku: p.internalSku,
      shortDescription: p.shortDescription,
      brandsCatalog: brands.map((b) => b.name),
      categoriesCatalog: [],
      // Familias retiradas: la IA ya no propone ni crea familias (la serie se detecta de los datos del fabricante).
      familiesCatalog: [],
    }),
    suggestRubroForProduct(prisma, {
      productName: p.normalizedName,
      sku: p.internalSku ?? p.supplierSku,
      brand: p.brand?.name,
      brandId: p.brandId,
      shortDescription: p.shortDescription,
      sourceCategoryPath: p.sourceCategoryPath,
    }),
  ]);
  return {
    ok: true,
    suggestion: { brand: brandSuggestion.brand, category: rubro.rubro, categoryNote: rubro.note, rationale: brandSuggestion.rationale },
  };
}

export async function applyClassificationSuggestion(input: {
  productId: string;
  brandName?: string | null;
  /** Ruta del árbol de Tango («SONIDO > BAFLES PASIVOS > BAFLES EXTERIOR»). Se valida exacto; nunca se crea. */
  rubroPath?: string | null;
  /** Ignorado: familias retiradas. */
  familyName?: string | null;
}): Promise<{ ok: boolean; error?: string; applied?: string[]; notApplied?: string[] }> {
  await requireStaff("products.edit", { costs: true });
  const data: { brandId?: string; categoryId?: string } = {};
  const applied: string[] = [];
  const notApplied: string[] = [];

  if (input.brandName !== undefined) {
    // Marcas no se crean automáticamente (precaución: brand es una entidad
    // con datos comerciales). Solo se aplica si existe; si no, queda la que tenía.
    const b = input.brandName ? await prisma.brand.findFirst({ where: { name: { equals: input.brandName, mode: "insensitive" } } }) : null;
    if (b) {
      data.brandId = b.id;
      applied.push(`Marca: ${b.name}.`);
    } else notApplied.push("Marca: no hay una marca del catálogo para aplicar; queda la que tenía.");
  }
  if (input.rubroPath !== undefined) {
    // Solo rubros activos del árbol de Tango, por ruta exacta. Nunca se crean categorías.
    const rubros = await loadActiveRubros(prisma);
    const path = matchRubroPath(input.rubroPath, rubros.map((r) => r.tangoPath));
    const rubro = path ? rubros.find((r) => r.tangoPath === path) : undefined;
    if (rubro) {
      data.categoryId = rubro.id;
      applied.push(`Rubro: ${tangoPathLabel(rubro.tangoPath)}.`);
    } else notApplied.push("Rubro: no hay una ruta del árbol que coincida; no se cambió.");
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, error: notApplied.join(" ") || "No había nada para aplicar: no se cambió nada.", applied, notApplied };
  }

  await prisma.product.update({ where: { id: input.productId }, data });
  revalidatePath(`/admin/products/${input.productId}`);
  revalidatePath(`/admin/products`);
  return { ok: true, applied, notApplied };
}

/**
 * Genera la descripción corta y la persiste. NO toca aiGeneratedDescription:
 * ese flag es de la descripción larga (cartel «Generado con IA» de la ficha) y
 * marcarlo acá hacía que una descripción oficial saliera como generada con IA.
 */
export async function generateProductShortDescription(
  productId: string
): Promise<{ ok: boolean; description?: string; error?: string }> {
  try {
    await requireStaff("products.edit", { costs: true });
    const p = await prisma.product.findUnique({
      where: { id: productId },
      include: { brand: true, category: true },
    });
    if (!p) return { ok: false, error: "Producto no encontrado." };

    const text = await generateShortDescription({
      name: p.normalizedName,
      brand: p.brand?.name,
      category: p.category?.name,
      avoid: p.shortDescription?.trim() || undefined,
      facts: {
        modelNumber: p.modelNumber,
        specifications: p.specifications,
        keyFeatures: p.keyFeatures,
        longDescription: p.longDescription,
      },
      noFallback: true,
    });
    if (!text) {
      return { ok: false, error: "La IA no pudo generar la descripción. Revisá la clave de OpenAI o probá de nuevo." };
    }

    await prisma.product.update({
      where: { id: productId },
      data: { shortDescription: text },
    });
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath(`/portal/products/${productId}`);
    return { ok: true, description: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, error: msg };
  }
}

/**
 * Guarda manualmente un texto (típicamente luego de generarlo con IA y editarlo).
 * Es útil cuando el usuario quiere ajustar el resultado antes de persistir.
 */
export async function saveProductDescriptions(input: {
  productId: string;
  short?: string;
  long?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireStaff("products.edit", { costs: true });
    const data: Record<string, unknown> = {};
    if (typeof input.short === "string") data.shortDescription = input.short || null;
    // Guardado a mano: no cambia la marca de IA (si era un texto generado y se
    // retocó, sigue marcado; si era de la ficha oficial, no pasa a ser «IA»).
    if (typeof input.long === "string") data.longDescription = input.long || null;
    if (Object.keys(data).length === 0) return { ok: true };
    await prisma.product.update({ where: { id: input.productId }, data });
    revalidatePath(`/admin/products/${input.productId}`);
    revalidatePath(`/portal/products/${input.productId}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, error: msg };
  }
}

export async function generateProductDescription(
  productId: string
): Promise<{ ok: boolean; description?: string; error?: string }> {
  try {
    await requireStaff("products.edit", { costs: true });
    const p = await prisma.product.findUnique({
      where: { id: productId },
      include: { brand: true, category: true },
    });
    if (!p) return { ok: false, error: "Producto no encontrado." };

    const text = await generateLongDescription({
      name: p.normalizedName,
      brand: p.brand?.name,
      category: p.category?.name,
      short: p.shortDescription || undefined,
    });

    await prisma.product.update({
      where: { id: productId },
      data: {
        longDescription: text,
        aiGeneratedDescription: true,
        aiDescriptionFeedbackStatus: "PENDING",
      },
    });
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath(`/portal/products/${productId}`);
    return { ok: true, description: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, error: msg };
  }
}

const MSE_BRANDS = /soundtube|soundsphere|solid ?drive|induction ?dynamics|rockustics|phase ?tech|darts/i;

export async function searchProductImagesAction(
  productId: string,
  query?: string
): Promise<{ ok: boolean; images: SerperImage[]; error?: string }> {
  await requireStaff("products.edit", { costs: true });
  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: { brand: true },
  });
  if (!p) return { ok: false, images: [], error: "Producto no encontrado." };

  const q = (query && query.trim().length > 0)
    ? query
    : [p.brand?.name, p.normalizedName].filter(Boolean).join(" ");
  // Marcas del grupo MSE (SoundTube, SoundSphere, SolidDrive…): primero en su sitio oficial.
  const mse = MSE_BRANDS.test(p.brand?.name ?? "");
  const first = mse ? await searchProductImagesOrError(`${q} site:soundtube.com`, 8) : null;
  const { images, error } = first?.images.length ? first : await searchProductImagesOrError(q, 8);
  return images.length ? { ok: true, images } : { ok: false, images: [], error };
}

/**
 * Sube un archivo de imagen a Vercel Blob y lo adjunta al producto.
 * Tope de tamaño: 15 MB. El formato se reconoce por el contenido (no por la
 * extensión): JPEG, PNG, WebP, AVIF, GIF, TIFF, BMP, SVG y HEIC si el
 * servidor lo soporta. Lo que no es JPEG/PNG/WebP liviano se convierte.
 *
 * Devuelve el id del producto para que el cliente pueda hacer router.refresh()
 * inmediato y ver la imagen en la galería.
 */
const MAX_IMAGE_SIZE = MAX_DOWNLOAD_BYTES;

export async function uploadProductImageFile(
  formData: FormData
): Promise<{ ok: boolean; error?: string; url?: string }> {
  try {
    await requireStaff("products.edit", { costs: true });
    const productId = String(formData.get("productId") || "");
    const file = formData.get("file");
    const alt = String(formData.get("alt") || "");
    const isPrimary =
      formData.get("isPrimary") === "true" || formData.get("isPrimary") === "on";

    if (!productId) return { ok: false, error: "Falta el productId." };
    if (!(file instanceof File)) return { ok: false, error: "No se recibió ningún archivo." };
    if (file.size === 0) return { ok: false, error: "El archivo está vacío." };
    if (file.size > MAX_IMAGE_SIZE) {
      return {
        ok: false,
        error: `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El tope es ${MAX_IMAGE_SIZE / 1024 / 1024} MB.`,
      };
    }
    if (!isBlobConfigured()) {
      return {
        ok: false,
        error:
          BLOB_NOT_CONFIGURED,
      };
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, internalSku: true, normalizedName: true },
    });
    if (!product) return { ok: false, error: "Producto no encontrado." };

    let normalized: NormalizedImage;
    try {
      normalized = await normalizeProductImage(Buffer.from(await file.arrayBuffer()));
    } catch (error) {
      if (error instanceof ImageRejectError) return { ok: false, error: error.message };
      throw error;
    }

    let fileUrl: string;
    try {
      // products/<id>/<timestamp>-<nombre>.<ext del formato guardado>
      fileUrl = await storeNormalizedImage(productId, normalized, file.name.replace(/\.[^.]+$/, ""));
    } catch (error) {
      console.error("[blob] foto de producto", error);
      return { ok: false, error: BLOB_UPLOAD_FAILED };
    }

    if (isPrimary) {
      await prisma.productImage.updateMany({
        where: { productId },
        data: { isPrimary: false },
      });
    }
    const created = await prisma.productImage.create({
      data: {
        productId,
        url: fileUrl,
        alt: alt || product.normalizedName || null,
        source: "upload",
        isPrimary,
      },
      select: { id: true },
    });
    // La principal es la primera de la galería: si se pidió principal, va adelante.
    if (isPrimary) await moveProductImageFirst(productId, created.id);
    await ensureProductHasPrimaryImage(productId);
    revalidateProductImages(productId);
    return { ok: true, url: fileUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido al subir el archivo.";
    return { ok: false, error: msg };
  }
}

export interface AttachImageInput {
  productId: string;
  url: string;
  alt?: string;
  /** Resultado de Serper: página de origen y miniatura de Google (plan B). */
  pageUrl?: string;
  thumbnail?: string;
  isPrimary?: boolean;
  /** "serper" (búsqueda) o "url" (pegada a mano). */
  origin?: "serper" | "url";
}

/**
 * Adjunta una foto de afuera: la descarga como un navegador, la valida por
 * contenido, la normaliza y la guarda en nuestro almacenamiento. Si no se
 * puede, devuelve el motivo para mostrarlo en la ficha.
 */
export async function attachProductImage(
  input: AttachImageInput,
): Promise<{ ok: boolean; error?: string; note?: string }> {
  await requireStaff("products.edit", { costs: true });
  const productId = String(input?.productId || "");
  const url = String(input?.url || "").trim().slice(0, 4000);
  if (!productId || !url) return { ok: false, error: "Falta la dirección de la imagen." };
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, normalizedName: true } });
  if (!product) return { ok: false, error: "Producto no encontrado." };

  const result = await importRemoteProductImage(
    productId,
    { url, pageUrl: input.pageUrl || null, thumbnail: input.thumbnail || null },
    input.alt || product.normalizedName || "imagen",
  );
  if (!result.ok) return { ok: false, error: result.message };

  if (input.isPrimary) {
    await prisma.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
  }
  const created = await prisma.productImage.create({
    data: {
      productId,
      url: result.url,
      alt: (input.alt || "").slice(0, 300) || product.normalizedName || null,
      source: input.origin === "url" ? "url" : "serper",
      isPrimary: Boolean(input.isPrimary),
    },
    select: { id: true },
  });
  if (input.isPrimary) await moveProductImageFirst(productId, created.id);
  await ensureProductHasPrimaryImage(productId);
  revalidateProductImages(productId);
  const notes = [
    result.via === "thumbnail" ? "la original no se pudo bajar: se guardó la miniatura de Google (más chica)" : null,
    result.via === "og:image" ? "se tomó la foto principal de la página de origen" : null,
    result.converted ? "se convirtió a un formato compatible" : null,
    result.stored === "external" ? "quedó enlazada al sitio original (no hay almacenamiento conectado)" : null,
  ].filter(Boolean);
  return { ok: true, note: notes.length ? `Imagen agregada: ${notes.join("; ")}.` : undefined };
}

export async function setPrimaryImage(formData: FormData): Promise<void> {
  await requireStaff("products.edit", { costs: true });
  const id = String(formData.get("id") || "");
  const productId = String(formData.get("productId") || "");
  if (!id || !productId) return;
  // La imagen tiene que ser de este producto: si no, no se toca nada.
  const image = await prisma.productImage.findFirst({ where: { id, productId }, select: { id: true } });
  if (!image) return;
  // Principal = primera de la galería: se lleva adelante y queda marcada.
  await moveProductImageFirst(productId, id);
  revalidateProductImages(productId);
}

export type DescriptionType = "short" | "long" | "both";

export interface BulkDescriptionResult {
  id: string;
  name: string;
  short: string | null;
  long: string | null;
  error?: string;
}

/**
 * Genera descripciones en modo PREVIEW (sin guardar) para editar antes de confirmar.
 */
export async function previewBulkDescriptions(
  productIds: string[],
  type: DescriptionType
): Promise<{ ok: boolean; results: BulkDescriptionResult[] }> {
  await requireStaff("products.edit", { costs: true });
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { brand: true, category: true },
  });

  const results: BulkDescriptionResult[] = [];
  for (const p of products) {
    try {
      let short: string | null = null;
      let long: string | null = null;
      if (type === "short" || type === "both") {
        short = await generateShortDescription({ name: p.normalizedName, brand: p.brand?.name, category: p.category?.name });
      }
      if (type === "long" || type === "both") {
        long = await generateLongDescription({ name: p.normalizedName, brand: p.brand?.name, category: p.category?.name, short: p.shortDescription || undefined });
      }
      results.push({ id: p.id, name: p.normalizedName, short, long });
    } catch (e) {
      results.push({ id: p.id, name: p.normalizedName, short: null, long: null, error: "Error al generar" });
    }
  }
  return { ok: true, results };
}

/**
 * Guarda las descripciones revisadas/editadas desde el modal.
 */
export async function saveBulkDescriptions(
  items: Array<{ id: string; short?: string | null; long?: string | null }>
): Promise<{ ok: boolean; saved: number }> {
  await requireStaff("products.edit", { costs: true });
  let saved = 0;
  for (const item of items) {
    const data: Record<string, unknown> = {};
    if (item.short !== undefined) data.shortDescription = item.short || null;
    if (item.long !== undefined) {
      data.longDescription = item.long || null;
      data.aiGeneratedDescription = Boolean(item.long);
      data.aiDescriptionFeedbackStatus = item.long ? "PENDING" : null;
    }
    if (Object.keys(data).length) {
      await prisma.product.update({ where: { id: item.id }, data });
      saved++;
    }
  }
  revalidatePath("/admin/products");
  return { ok: true, saved };
}

/**
 * Genera descripciones largas con IA para varios productos en lote (modo directo, sin preview).
 */
export async function bulkGenerateDescriptions(
  productIds: string[]
): Promise<{ ok: boolean; processed: number; errors: number }> {
  await requireStaff("products.edit", { costs: true });
  let processed = 0;
  let errors = 0;
  for (const id of productIds) {
    try {
      const r = await generateProductDescription(id);
      if (r.ok) processed++;
      else errors++;
    } catch (e) {
      console.error("bulkGenerateDescriptions error", e);
      errors++;
    }
  }
  revalidatePath("/admin/products");
  return { ok: true, processed, errors };
}

/**
 * Busca y adjunta la primera imagen sugerida por Serper para cada producto sin imágenes.
 * Pensado como pre-población rápida; el admin puede luego curar la selección por producto.
 */
export async function bulkSearchImages(
  productIds: string[]
): Promise<{ ok: boolean; processed: number; skipped: number }> {
  await requireStaff("products.edit", { costs: true });
  const ids = productIds;
  let processed = 0;
  let skipped = 0;
  for (const id of ids) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { brand: true, images: true },
    });
    if (!product) {
      skipped++;
      continue;
    }
    if (product.images.length > 0) {
      skipped++;
      continue;
    }
    const q = [product.brand?.name, product.normalizedName].filter(Boolean).join(" ");
    // Se prueban los primeros resultados hasta que uno se pueda bajar y guardar
    // (antes se guardaba el primero tal cual, aunque fuera «x-raw-image» o no cargara).
    const images = await searchProductImages(q, 4);
    let storedUrl: string | null = null;
    for (const candidate of images) {
      const result = await importRemoteProductImage(
        id,
        { url: candidate.url, pageUrl: candidate.pageUrl, thumbnail: candidate.thumbnail },
        product.normalizedName || q,
      );
      if (result.ok) {
        storedUrl = result.url;
        break;
      }
    }
    if (!storedUrl) {
      skipped++;
      continue;
    }
    await prisma.productImage.create({
      data: {
        productId: id,
        url: storedUrl,
        alt: product.normalizedName,
        source: "serper-bulk",
        isPrimary: true,
      },
    });
    processed++;
  }
  revalidatePath("/admin/products");
  return { ok: true, processed, skipped };
}

export async function deleteProductImage(formData: FormData): Promise<void> {
  await requireStaff("products.edit", { costs: true });
  const id = String(formData.get("id") || "");
  const productId = String(formData.get("productId") || "");
  if (!id || !productId) return;
  const removed = await prisma.productImage.deleteMany({ where: { id, productId } });
  if (!removed.count) return;
  await ensureProductHasPrimaryImage(productId);
  revalidateProductImages(productId);
}
