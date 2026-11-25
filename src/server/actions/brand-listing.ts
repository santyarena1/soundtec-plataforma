"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { getCatalog } from "@/lib/catalog";
import { productTitle } from "@/lib/product-display";
import { createBrandListingIndex, rubroHighlightFor, toggleRubroFirst, type ListingSection } from "@/lib/brand-listing-order";
import { loadBrandOrder, type ProductRubroHighlight } from "@/server/catalog/brand-listing-data";

/**
 * Lo que decide cómo se ve una marca en el catálogo del cliente:
 * estrella por producto, orden de rubros y «Próximamente».
 */

type Result = { ok: true } | { ok: false; error: string };

function revalidateCatalog(): void {
  revalidatePath("/portal/products", "layout");
  revalidatePath("/catalogo", "layout");
  revalidatePath("/portal");
  revalidatePath("/admin/brands");
  revalidatePath("/admin/products", "layout");
}

const idSchema = z.string().min(1).max(64);

/** Marca o quita la estrella de un producto (sale primero al entrar a su marca). */
export async function setProductFeatured(productId: string, featured: boolean): Promise<Result> {
  await requireStaff("products.edit");
  const parsed = z.object({ productId: idSchema, featured: z.boolean() }).safeParse({ productId, featured });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const updated = await prisma.product.updateMany({ where: { id: parsed.data.productId }, data: { isFeatured: parsed.data.featured } });
  if (updated.count === 0) return { ok: false, error: "No se encontró el producto." };
  revalidateCatalog();
  return { ok: true };
}

/** Prende o apaga «Próximamente» en una marca. */
export async function toggleBrandComingSoon(brandId: string, _formData?: FormData): Promise<void> {
  await requireStaff("brands.manage");
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { comingSoon: true } });
  if (!brand) return;
  await prisma.brand.update({ where: { id: brandId }, data: { comingSoon: !brand.comingSoon } });
  revalidateCatalog();
}

// ── Editor «Orden de rubros en el catálogo» ─────────────────────────────────

export interface BrandCategoryOption {
  id: string;
  name: string;
  /** Ruta legible («Sonido › Bafles pasivos»). */
  label: string;
  parentId: string | null;
  /** Profundidad en el árbol (1 = rubro). */
  depth: number;
  /** Productos activos de la marca en ese rubro y todo lo que cuelga de él. */
  count: number;
}

export interface BrandCategoryOrderData {
  order: string[];
  options: BrandCategoryOption[];
  /** Avisos de rubros viejos del orden guardado (pasados a Tango o descartados). */
  notices: string[];
  /** El orden guardado tenía rubros viejos: al guardar queda limpio. */
  needsSave: boolean;
  /** Lo que está guardado hoy, sin limpiar. */
  saved: string[];
}

/** Rubros de Tango donde la marca tiene productos (con sus ancestros) y el orden guardado. */
export async function getBrandCategoryOrder(brandId: string): Promise<BrandCategoryOrderData> {
  await requireStaff("brands.manage");
  const id = idSchema.parse(brandId);
  const [state, groups] = await Promise.all([
    loadBrandOrder(id, { fresh: true }),
    prisma.product.groupBy({ by: ["categoryId"], where: { brandId: id, isActive: true, categoryId: { not: null } }, _count: { _all: true } }),
  ]);
  if (!state) return { order: [], options: [], notices: ["No se encontró la marca."], needsSave: false, saved: [] };
  const index = createBrandListingIndex({ categoryOrder: state.order, categories: state.categories });
  const counts = new Map<string, number>();
  for (const group of groups) {
    const node = group.categoryId ? index.byId.get(group.categoryId) : undefined;
    if (!node || node.isTango === false) continue;
    for (const ancestor of index.chainOf(node.id)) counts.set(ancestor, (counts.get(ancestor) ?? 0) + group._count._all);
  }
  const options = [...counts.entries()]
    .map(([optionId, count]) => {
      const chain = index.chainOf(optionId);
      return {
        id: optionId,
        name: index.nameOf(optionId),
        label: chain.map(index.nameOf).join(" › "),
        parentId: index.byId.get(optionId)?.parentId ?? null,
        depth: chain.length,
        count,
      };
    })
    .sort((a, b) => (index.byId.get(a.id)?.sortKey ?? "").localeCompare(index.byId.get(b.id)?.sortKey ?? "", "es"));
  const nameOf = (categoryId: string) => index.chainOf(categoryId).map(index.nameOf).join(" › ") || index.nameOf(categoryId);
  const notices = [
    ...state.migrated.map((m) => `«${m.fromName ?? "Rubro viejo"}» (rubro viejo) pasó a «${nameOf(m.to)}», donde están hoy sus productos.`),
    ...state.dropped.map((d) => `«${d.name ?? "Rubro borrado"}» ya no existe en el árbol de Tango y se sacó del orden.`),
  ];
  return { order: state.order, options, notices, needsSave: state.migrated.length + state.dropped.length > 0, saved: state.saved };
}

const orderSchema = z.object({ brandId: idSchema, order: z.array(idSchema).max(200) });

/** Guarda el orden de rubros de la marca (el primero va arriba). Solo rubros activos de Tango. */
export async function saveBrandCategoryOrder(brandId: string, order: string[]): Promise<Result> {
  await requireStaff("brands.manage");
  const parsed = orderSchema.safeParse({ brandId, order });
  if (!parsed.success) return { ok: false, error: "Orden inválido." };
  const unique = [...new Set(parsed.data.order)];
  const existing = await prisma.category.findMany({
    where: { id: { in: unique }, isActive: true, tangoPath: { not: null } },
    select: { id: true },
  });
  const valid = new Set(existing.map((c) => c.id));
  await prisma.brand.update({ where: { id: parsed.data.brandId }, data: { categoryOrder: unique.filter((id) => valid.has(id)) } });
  revalidateCatalog();
  return { ok: true };
}

export interface BrandPreviewItem {
  id: string;
  title: string;
  image: string | null;
  isFeatured: boolean;
  categoryName: string | null;
}

export interface BrandPreview {
  total: number;
  items: BrandPreviewItem[];
  sections: ListingSection[];
}

const PREVIEW_SIZE = 24;

/**
 * Los primeros productos de la marca como los ve un cliente al entrar (sin
 * búsqueda, «Más relevantes»), con el orden de rubros que se está editando.
 */
export async function previewBrandListing(brandId: string, order: string[]): Promise<BrandPreview> {
  await requireStaff("brands.manage");
  const parsed = orderSchema.parse({ brandId, order });
  const result = await getCatalog(
    { brandIds: [parsed.brandId], brandCategoryOrder: parsed.order, sort: "relevance", page: 1, pageSize: PREVIEW_SIZE, stock: "any", kind: "any" },
    { commercialClientId: null, userId: null, isAdmin: false, publicMode: true }
  );
  return {
    total: result.total,
    items: result.items.map((item) => ({
      id: item.id,
      title: productTitle(item),
      image: item.primaryImage,
      isFeatured: item.isFeatured,
      categoryName: item.categoryName,
    })),
    sections: result.sections ?? [],
  };
}

export interface BrandProductHit {
  id: string;
  title: string;
  subtitle: string | null;
  isFeatured: boolean;
}

/** Productos activos de la marca para destacar: los que coinciden con `query`, o los destacados si viene vacío. */
export async function searchBrandProducts(brandId: string, query: string): Promise<BrandProductHit[]> {
  await requireStaff(["brands.manage", "products.edit"]);
  const id = idSchema.parse(brandId);
  const q = z.string().max(80).parse(query ?? "").trim();
  const rows = await prisma.product.findMany({
    where: {
      brandId: id,
      isActive: true,
      ...(q
        ? {
            OR: [
              { normalizedName: { contains: q, mode: "insensitive" } },
              { modelNumber: { contains: q, mode: "insensitive" } },
              { originalName: { contains: q, mode: "insensitive" } },
              { internalSku: { contains: q, mode: "insensitive" } },
            ],
          }
        : { isFeatured: true }),
    },
    orderBy: [{ isFeatured: "desc" }, { normalizedName: "asc" }],
    take: q ? 12 : 50,
    select: { id: true, normalizedName: true, modelNumber: true, originalName: true, isFeatured: true, category: { select: { name: true } } },
  });
  return rows.map((row) => ({ id: row.id, title: productTitle(row), subtitle: row.category?.name ?? null, isFeatured: row.isFeatured }));
}

// ── «Destacar rubro en su marca» (desde un producto) ─────────────────────────

/** Estado del rubro del producto en el orden de su marca. null = sin marca o sin rubro de Tango. */
export async function getProductRubroHighlight(productId: string): Promise<ProductRubroHighlight | null> {
  await requireStaff("products.edit");
  const product = await prisma.product.findUnique({ where: { id: idSchema.parse(productId) }, select: { brandId: true, categoryId: true } });
  if (!product?.brandId) return null;
  const state = await loadBrandOrder(product.brandId);
  if (!state) return null;
  const index = createBrandListingIndex({ categoryOrder: state.order, categories: state.categories });
  const highlight = rubroHighlightFor(index, state.order, product.categoryId);
  return highlight ? { ...highlight, brandId: product.brandId, brandName: state.brandName } : null;
}

/**
 * Pone el rubro del producto 1.º en el orden de su marca (`first`) o lo saca del
 * orden. Mismo permiso que la estrella. Los rubros viejos del orden se limpian.
 */
export async function setProductRubroFirst(
  productId: string,
  first: boolean
): Promise<{ ok: true; highlight: ProductRubroHighlight | null } | { ok: false; error: string }> {
  await requireStaff("products.edit");
  const parsed = z.object({ productId: idSchema, first: z.boolean() }).safeParse({ productId, first });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const product = await prisma.product.findUnique({ where: { id: parsed.data.productId }, select: { brandId: true, categoryId: true } });
  if (!product?.brandId) return { ok: false, error: "El producto no tiene marca." };
  const state = await loadBrandOrder(product.brandId, { fresh: true });
  if (!state) return { ok: false, error: "No se encontró la marca." };
  const index = createBrandListingIndex({ categoryOrder: state.order, categories: state.categories });
  const current = rubroHighlightFor(index, state.order, product.categoryId);
  if (!current) return { ok: false, error: "El producto no tiene un rubro del árbol de Tango." };
  const nextOrder = toggleRubroFirst(state.order, current.rubroId, parsed.data.first);
  await prisma.brand.update({ where: { id: product.brandId }, data: { categoryOrder: nextOrder } });
  revalidateCatalog();
  const nextIndex = createBrandListingIndex({ categoryOrder: nextOrder, categories: state.categories });
  const highlight = rubroHighlightFor(nextIndex, nextOrder, product.categoryId);
  return { ok: true, highlight: highlight ? { ...highlight, brandId: product.brandId, brandName: state.brandName } : null };
}
