"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { generateLongDescription, generateShortDescription, suggestProductClassification, type ClassificationSuggestion } from "@/services/openai";
import { searchProductImages, type SerperImage } from "@/services/serper";

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
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const data: { brandId?: string | null; categoryId?: string | null; familyId?: string | null } = {};

  if (input.brandName !== undefined) {
    if (input.brandName) {
      const b = await prisma.brand.findFirst({ where: { name: { equals: input.brandName, mode: "insensitive" } } });
      data.brandId = b?.id ?? null;
    } else {
      data.brandId = null;
    }
  }
  if (input.categoryName !== undefined) {
    if (input.categoryName) {
      const c = await prisma.category.findFirst({ where: { name: { equals: input.categoryName, mode: "insensitive" } } });
      data.categoryId = c?.id ?? null;
    } else {
      data.categoryId = null;
    }
  }
  if (input.familyName !== undefined) {
    if (input.familyName) {
      const f = await prisma.productFamily.findFirst({ where: { name: { equals: input.familyName, mode: "insensitive" } } });
      data.familyId = f?.id ?? null;
    } else {
      data.familyId = null;
    }
  }

  await prisma.product.update({ where: { id: input.productId }, data });
  revalidatePath(`/admin/products/${input.productId}`);
  revalidatePath(`/admin/products`);
  return { ok: true };
}

export async function generateProductDescription(
  productId: string
): Promise<{ ok: boolean; description?: string; error?: string }> {
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
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/portal/products/${productId}`);
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
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/portal/products/${productId}`);
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
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/portal/products/${productId}`);
}
