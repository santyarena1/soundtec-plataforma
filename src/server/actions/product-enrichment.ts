"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { generateLongDescription, generateShortDescription, suggestProductClassification, type ClassificationSuggestion } from "@/services/openai";
import { searchProductImages, type SerperImage } from "@/services/serper";
import { getSetting, setSetting } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import { put } from "@vercel/blob";

function revalidateProductImages(productId: string) {
  if (productId) {
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath(`/portal/products/${productId}`);
  }
  revalidatePath("/admin/products");
  revalidatePath("/portal/products");
}

/** Si hay fotos pero ninguna es principal, marca la más vieja. El listado la usa de tapa. */
async function ensureProductHasPrimaryImage(productId: string) {
  if (!productId) return;
  const primary = await prisma.productImage.findFirst({
    where: { productId, isPrimary: true },
    select: { id: true },
  });
  if (primary) return;
  const first = await prisma.productImage.findFirst({
    where: { productId },
    orderBy: { createdAt: "asc" },
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

export async function suggestClassificationAction(
  productId: string
): Promise<{ ok: boolean; suggestion?: ClassificationSuggestion; error?: string }> {
  await requireAdmin();
  const [p, brands, categories, families] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId } }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.productFamily.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  if (!p) return { ok: false, error: "Producto no encontrado." };

  const suggestion = await suggestProductClassification({
    productName: p.normalizedName,
    productSku: p.internalSku,
    shortDescription: p.shortDescription,
    brandsCatalog: brands.map((b) => b.name),
    categoriesCatalog: categories.map((c) => c.name),
    familiesCatalog: families.map((f) => f.name),
  });
  return { ok: true, suggestion };
}

export async function applyClassificationSuggestion(input: {
  productId: string;
  brandName?: string | null;
  categoryName?: string | null;
  familyName?: string | null;
  /** Si true, categoría y familia se crean si no existen. */
  createIfMissing?: boolean;
}): Promise<{ ok: boolean; error?: string; createdCategory?: boolean; createdFamily?: boolean }> {
  await requireAdmin();
  const data: { brandId?: string | null; categoryId?: string | null; familyId?: string | null } = {};
  let createdCategory = false;
  let createdFamily = false;

  if (input.brandName !== undefined) {
    if (input.brandName) {
      // Marcas no se crean automáticamente (precaución: brand es una entidad
      // con datos comerciales). Solo se aplica si existe.
      const b = await prisma.brand.findFirst({ where: { name: { equals: input.brandName, mode: "insensitive" } } });
      data.brandId = b?.id ?? null;
    } else {
      data.brandId = null;
    }
  }
  if (input.categoryName !== undefined) {
    if (input.categoryName) {
      let c = await prisma.category.findFirst({ where: { name: { equals: input.categoryName, mode: "insensitive" } } });
      if (!c && input.createIfMissing) {
        c = await prisma.category.create({
          data: { name: input.categoryName.trim(), slug: slugify(input.categoryName.trim()) },
        });
        createdCategory = true;
      }
      data.categoryId = c?.id ?? null;
    } else {
      data.categoryId = null;
    }
  }
  if (input.familyName !== undefined) {
    if (input.familyName) {
      let f = await prisma.productFamily.findFirst({ where: { name: { equals: input.familyName, mode: "insensitive" } } });
      if (!f && input.createIfMissing) {
        f = await prisma.productFamily.create({
          data: { name: input.familyName.trim(), slug: slugify(input.familyName.trim()) },
        });
        createdFamily = true;
      }
      data.familyId = f?.id ?? null;
    } else {
      data.familyId = null;
    }
  }

  await prisma.product.update({ where: { id: input.productId }, data });
  revalidatePath(`/admin/products/${input.productId}`);
  revalidatePath(`/admin/products`);
  return { ok: true, createdCategory, createdFamily };
}

/**
 * Genera la descripción corta y la persiste. Marca aiGeneratedDescription=true
 * porque el corto también es contenido IA (incluso si el largo no lo es).
 */
export async function generateProductShortDescription(
  productId: string
): Promise<{ ok: boolean; description?: string; error?: string }> {
  try {
    await requireAdmin();
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
    });

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
    await requireAdmin();
    const data: Record<string, unknown> = {};
    if (typeof input.short === "string") data.shortDescription = input.short || null;
    if (typeof input.long === "string") {
      data.longDescription = input.long || null;
      if (input.long) {
        data.aiGeneratedDescription = true;
        data.aiDescriptionFeedbackStatus = "PENDING";
      }
    }
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
    await requireAdmin();
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

export async function searchProductImagesAction(
  productId: string,
  query?: string
): Promise<{ ok: boolean; images: SerperImage[]; error?: string }> {
  await requireAdmin();
  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: { brand: true },
  });
  if (!p) return { ok: false, images: [], error: "Producto no encontrado." };

  const q = (query && query.trim().length > 0)
    ? query
    : [p.brand?.name, p.normalizedName].filter(Boolean).join(" ");
  const images = await searchProductImages(q, 8);
  return { ok: true, images };
}

/**
 * Sube un archivo de imagen a Vercel Blob y lo adjunta al producto.
 * Tope de tamaño: 8 MB. Tipos aceptados: image/*.
 *
 * Devuelve el id del producto para que el cliente pueda hacer router.refresh()
 * inmediato y ver la imagen en la galería.
 */
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

export async function uploadProductImageFile(
  formData: FormData
): Promise<{ ok: boolean; error?: string; url?: string }> {
  try {
    await requireAdmin();
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
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        ok: false,
        error: `Tipo no soportado (${file.type}). Aceptamos PNG, JPEG, WebP, GIF, AVIF.`,
      };
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return {
        ok: false,
        error:
          "Falta configurar Vercel Blob. Vincula el storage en Vercel y agregá BLOB_READ_WRITE_TOKEN al entorno.",
      };
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, internalSku: true, normalizedName: true },
    });
    if (!product) return { ok: false, error: "Producto no encontrado." };

    // Path determinístico: products/<id>/<timestamp>-<sluggified-filename>
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const baseName = slugify(file.name.replace(/\.[^.]+$/, "")) || "image";
    const pathname = `products/${productId}/${Date.now()}-${baseName}.${ext}`;

    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type,
    });

    if (isPrimary) {
      await prisma.productImage.updateMany({
        where: { productId },
        data: { isPrimary: false },
      });
    }
    await prisma.productImage.create({
      data: {
        productId,
        url: blob.url,
        alt: alt || product.normalizedName || null,
        source: "upload",
        isPrimary,
      },
    });
    await ensureProductHasPrimaryImage(productId);
    revalidateProductImages(productId);
    return { ok: true, url: blob.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido al subir el archivo.";
    return { ok: false, error: msg };
  }
}

export async function attachProductImage(formData: FormData): Promise<void> {
  await requireAdmin();
  const productId = String(formData.get("productId") || "");
  const url = String(formData.get("url") || "");
  const alt = String(formData.get("alt") || "");
  const isPrimary = formData.get("isPrimary") === "true" || formData.get("isPrimary") === "on";
  if (!productId || !url) return;

  if (isPrimary) {
    await prisma.productImage.updateMany({
      where: { productId },
      data: { isPrimary: false },
    });
  }
  await prisma.productImage.create({
    data: { productId, url, alt: alt || null, source: "serper", isPrimary },
  });
  await ensureProductHasPrimaryImage(productId);
  revalidateProductImages(productId);
}

export async function setPrimaryImage(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const productId = String(formData.get("productId") || "");
  if (!id || !productId) return;
  await prisma.productImage.updateMany({
    where: { productId },
    data: { isPrimary: false },
  });
  await prisma.productImage.update({ where: { id }, data: { isPrimary: true } });
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
    const images = await searchProductImages(q, 1);
    const first = images[0];
    if (!first) {
      skipped++;
      continue;
    }
    await prisma.productImage.create({
      data: {
        productId: id,
        url: first.url,
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
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const productId = String(formData.get("productId") || "");
  if (!id) return;
  await prisma.productImage.delete({ where: { id } });
  if (productId) await ensureProductHasPrimaryImage(productId);
  revalidateProductImages(productId);
}
