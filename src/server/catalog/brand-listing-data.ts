import { prisma } from "@/lib/prisma";
import {
  categorySortKeys,
  commonCategoryAncestor,
  createBrandListingIndex,
  matchCategoryByName,
  resolveCategoryOrder,
  rubroHighlightFor,
  type BrandListingCategory,
  type ResolvedCategoryOrder,
  type RubroHighlight,
} from "@/lib/brand-listing-order";

/**
 * Datos del orden por marca (ver lib/brand-listing-order): árbol de rubros,
 * orden guardado ya limpio de rubros viejos y estado de «Destacar rubro».
 */

let categoriesCache: { at: number; rows: BrandListingCategory[] } | null = null;
const CATEGORIES_TTL_MS = 5 * 60_000;

/** Todos los rubros con su ruta (cache de 5 minutos; `fresh` lo saltea). */
export async function loadListingCategories(fresh = false): Promise<BrandListingCategory[]> {
  if (!fresh && categoriesCache && Date.now() - categoriesCache.at < CATEGORIES_TTL_MS) return categoriesCache.rows;
  const rows = await prisma.category.findMany({ select: { id: true, parentId: true, name: true, tangoPath: true, isActive: true } });
  categoriesCache = { at: Date.now(), rows: categorySortKeys(rows) };
  return categoriesCache.rows;
}

/**
 * Categorías viejas del orden → rubro de Tango donde terminaron sus productos
 * (reclasificación aprobada de productos de esta marca) o, si no hay, el rubro
 * de la marca con el mismo nombre. Si se repartieron en
 * rubros sin un padre común de nivel 2 o más, no hay equivalente.
 */
export async function legacyCategoryMap(
  brandId: string,
  order: readonly string[],
  categories: readonly BrandListingCategory[]
): Promise<Map<string, string | null>> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const legacy = order.filter((id) => {
    const node = byId.get(id);
    return !node || node.isTango === false || node.isActive === false;
  });
  const map = new Map<string, string | null>();
  if (legacy.length === 0) return map;
  const [moved, brandGroups] = await Promise.all([
    prisma.categoryProposal.findMany({
      where: { previousCategoryId: { in: legacy }, status: "APPROVED" },
      select: { previousCategoryId: true, product: { select: { brandId: true, categoryId: true } } },
    }),
    prisma.product.groupBy({ by: ["categoryId"], where: { brandId, isActive: true, categoryId: { not: null } } }),
  ]);
  // Rubros de Tango donde la marca tiene productos (con sus ancestros), para el respaldo por nombre.
  const brandRubros = new Set<string>();
  for (const group of brandGroups) {
    let current = group.categoryId ? byId.get(group.categoryId) : undefined;
    while (current && current.isTango !== false && !brandRubros.has(current.id)) {
      brandRubros.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  const candidates = categories.filter((c) => brandRubros.has(c.id) && c.isActive !== false);
  for (const id of legacy) {
    // Solo productos de esta marca: lo que otra marca hizo con esa categoría no dice nada de esta.
    const ofBrand = moved.filter((m) => m.previousCategoryId === id && m.product.categoryId && m.product.brandId === brandId);
    const targets = [...new Set(ofBrand.map((m) => m.product.categoryId as string))].filter(
      (target) => byId.get(target)?.isTango !== false
    );
    map.set(id, commonCategoryAncestor(targets, categories) ?? matchCategoryByName(byId.get(id)?.name, candidates));
  }
  return map;
}

export interface BrandOrderState extends ResolvedCategoryOrder {
  brandName: string;
  /** Lo que está guardado hoy, sin limpiar. */
  saved: string[];
  categories: BrandListingCategory[];
}

/** Orden de rubros de la marca listo para usar (rubros viejos pasados o descartados). */
export async function loadBrandOrder(brandId: string, options?: { fresh?: boolean; override?: string[] }): Promise<BrandOrderState | null> {
  const [brand, categories] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId }, select: { name: true, categoryOrder: true } }),
    loadListingCategories(options?.fresh),
  ]);
  if (!brand) return null;
  const saved = options?.override ?? brand.categoryOrder ?? [];
  const legacyMap = await legacyCategoryMap(brandId, saved, categories);
  return { brandName: brand.name, saved, categories, ...resolveCategoryOrder(saved, categories, legacyMap) };
}

export interface ProductRubroHighlight extends RubroHighlight {
  brandId: string;
  brandName: string;
}

/** Estado de «Destacar rubro en su marca» de varios productos (tarjetas del equipo). */
export async function getRubroHighlights(productIds: readonly string[]): Promise<Record<string, ProductRubroHighlight>> {
  if (productIds.length === 0) return {};
  const products = await prisma.product.findMany({
    where: { id: { in: [...productIds] }, brandId: { not: null } },
    select: { id: true, brandId: true, categoryId: true },
  });
  const brandIds = [...new Set(products.map((p) => p.brandId as string))];
  const states = new Map<string, BrandOrderState>();
  await Promise.all(
    brandIds.map(async (brandId) => {
      const state = await loadBrandOrder(brandId);
      if (state) states.set(brandId, state);
    })
  );
  const out: Record<string, ProductRubroHighlight> = {};
  for (const product of products) {
    const state = states.get(product.brandId as string);
    if (!state) continue;
    const index = createBrandListingIndex({ categoryOrder: state.order, categories: state.categories });
    const highlight = rubroHighlightFor(index, state.order, product.categoryId);
    if (highlight) out[product.id] = { ...highlight, brandId: product.brandId as string, brandName: state.brandName };
  }
  return out;
}
