import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calculatePricesForProducts,
  getClientVisibility,
  type PriceBreakdown,
  type ProductPricingInput,
} from "@/lib/pricing";
import { getGlobalMarginPercent } from "@/lib/settings";

/**
 * Construye el OR del filtro de búsqueda extendido. Buscar SIMULTÁNEAMENTE en:
 * - nombre display (normalizedName) y original (originalName)
 * - SKUs (interno + proveedor + modelNumber + manufacturerItem)
 * - descripciones cortas y largas
 * - productLine, tariffPosition, coo
 * - nombre de brand / category / family (relations)
 * - JSON sourceMetadata / specifications (string_to_jsonb stringify match)
 *
 * Tokeniza por espacios y exige que TODOS los tokens matcheen en al menos un
 * campo (AND between tokens, OR between fields). Esto es lo que la gente
 * espera de un search "tipo Google" sobre catálogos.
 */
function buildSearchOr(search: string): Prisma.ProductWhereInput["OR"] {
  const tokens = search
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return undefined;

  // Para cada token armamos un grupo OR sobre todos los campos buscables.
  // Devolvemos el array de OR del primer token; los tokens 1+ se manejan
  // como AND en el caller. Pero como acá la firma esperada es OR, devolvemos
  // solo el primer token cuando hay uno solo (caso típico). Para multi-token
  // ver buildSearchAnd que usa el caller.
  return tokenFieldOr(tokens[0]);
}

function tokenFieldOr(token: string): NonNullable<Prisma.ProductWhereInput["OR"]> {
  const c = { contains: token, mode: "insensitive" as const };
  return [
    { normalizedName: c },
    { originalName: c },
    { internalSku: c },
    { supplierSku: c },
    { shortDescription: c },
    { longDescription: c },
    { tariffPosition: c },
    { coo: c },
    // Columnas opcionales agregadas por el sync — castean a string via raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { modelNumber: c } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { manufacturerItem: c } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { productLine: c } as any,
    { brand: { name: c } },
    { category: { name: c } },
    { family: { name: c } },
    { distributor: { name: c } },
  ];
}

/**
 * Variante AND multi-token: usada en buildCatalogWhere directamente para que
 * "shure sm58" matchee productos que tengan AMBAS palabras en algún campo.
 */
function buildSearchAnd(search: string): Prisma.ProductWhereInput[] | undefined {
  const tokens = search
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return undefined;
  return tokens.map((t) => ({ OR: tokenFieldOr(t) }));
}

export interface CatalogFilters {
  search?: string;
  brandIds?: string[];
  distributorIds?: string[];
  categoryIds?: string[];
  familyIds?: string[];
  stock?: "in_stock" | "low_stock" | "on_request" | "any";
  hasDiscount?: boolean;
  favoritesOnly?: boolean;
  crestronOnly?: boolean;
  kind?: "PRINCIPAL" | "ACCESORIO" | "any";
  minPrice?: number;
  maxPrice?: number;
  sort?: "price_asc" | "price_desc" | "name_asc" | "name_desc" | "newest";
  page?: number;
  pageSize?: number;
}

export interface CatalogProduct {
  id: string;
  internalSku: string | null;
  normalizedName: string;
  shortDescription: string | null;
  brandName: string | null;
  categoryName: string | null;
  primaryImage: string | null;
  stockStatus: string;
  stockQuantity: number | null;
  isCustomizable: boolean;
  isCrestronHomeCompatible: boolean;
  kind: "PRINCIPAL" | "ACCESORIO";
  accessoryRequiredWithPrimary: boolean;
  pricing: PriceBreakdown;
  isFavorite: boolean;
}

export type FacetOption = { id: string; name: string; count: number };

export interface CatalogSidebarMeta {
  priceBounds: { min: number; max: number };
  brands: FacetOption[];
  categories: FacetOption[];
  families: FacetOption[];
  distributors: FacetOption[];
  stockCounts: { in_stock: number; low_stock: number; on_request: number };
  discountCount: number;
  totalMatching: number;
}

const CATALOG_FETCH_CAP = 2500;

type CatalogContext = {
  commercialClientId: string | null;
  userId: string;
  isAdmin: boolean;
};

type ProductRow = Prisma.ProductGetPayload<{
  include: {
    brand: { select: { id: true; name: true } };
    category: { select: { id: true; name: true } };
    images: { where: { isPrimary: true }; take: 1 };
  };
}>;

async function resolveVisibility(clientId: string | null, isAdmin: boolean) {
  if (!clientId || isAdmin) {
    return {
      hiddenProductIds: [] as string[],
      hiddenBrandIds: [] as string[],
      hiddenCategoryIds: [] as string[],
      hiddenDistributorIds: [] as string[],
      hiddenFamilyIds: [] as string[],
    };
  }
  const vis = await getClientVisibility(clientId);
  return {
    hiddenProductIds: [...vis.hidden.productIds],
    hiddenBrandIds: [...vis.hidden.brandIds],
    hiddenCategoryIds: [...vis.hidden.categoryIds],
    hiddenDistributorIds: [...vis.hidden.distributorIds],
    hiddenFamilyIds: [...vis.hidden.familyIds],
  };
}

async function buildCatalogWhere(
  filters: CatalogFilters,
  ctx: CatalogContext,
  options?: { skipPrice?: boolean }
): Promise<Prisma.ProductWhereInput | null> {
  const hidden = await resolveVisibility(ctx.commercialClientId, ctx.isAdmin);

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    ...(hidden.hiddenProductIds.length ? { id: { notIn: hidden.hiddenProductIds } } : {}),
    ...(hidden.hiddenBrandIds.length ? { brandId: { notIn: hidden.hiddenBrandIds } } : {}),
    ...(hidden.hiddenCategoryIds.length ? { categoryId: { notIn: hidden.hiddenCategoryIds } } : {}),
    ...(hidden.hiddenDistributorIds.length ? { distributorId: { notIn: hidden.hiddenDistributorIds } } : {}),
    ...(hidden.hiddenFamilyIds.length ? { familyId: { notIn: hidden.hiddenFamilyIds } } : {}),
    ...(filters.brandIds?.length ? { brandId: { in: filters.brandIds } } : {}),
    ...(ctx.isAdmin && filters.distributorIds?.length
      ? { distributorId: { in: filters.distributorIds } }
      : {}),
    ...(filters.categoryIds?.length ? { categoryId: { in: filters.categoryIds } } : {}),
    ...(filters.familyIds?.length ? { familyId: { in: filters.familyIds } } : {}),
    ...(filters.kind === "PRINCIPAL" ? { kind: "PRINCIPAL" } : {}),
    ...(filters.kind === "ACCESORIO" ? { kind: "ACCESORIO" } : {}),
    ...(filters.stock === "in_stock"
      ? { stockStatus: "IN_STOCK" }
      : filters.stock === "low_stock"
        ? { stockStatus: "LOW_STOCK" }
        : filters.stock === "on_request"
          ? { stockStatus: "ON_REQUEST" }
          : {}),
    ...(filters.hasDiscount ? { discountPercent: { gt: 0 } } : {}),
    ...(filters.crestronOnly ? { isCrestronHomeCompatible: true } : {}),
    ...(filters.search
      ? (() => {
          const ands = buildSearchAnd(filters.search);
          return ands && ands.length > 0 ? { AND: ands } : {};
        })()
      : {}),
  };
  // Mantenemos la referencia al builder OR para compatibilidad con otros llamadores.
  void buildSearchOr;

  if (filters.favoritesOnly) {
    const favs = await prisma.wishlistItem.findMany({
      where: { wishlist: { userId: ctx.userId } },
      select: { productId: true },
    });
    const ids = favs.map((f) => f.productId);
    if (ids.length === 0) return null;
    where.id = { in: ids };
  }

  void options;
  return where;
}

function toPricingInput(p: ProductRow): ProductPricingInput {
  return {
    productId: p.id,
    baseCostUsd: Number(p.baseCostUsd),
    brandId: p.brandId,
    distributorId: p.distributorId,
    categoryId: p.categoryId,
    familyId: p.familyId,
    productDiscountPercent: p.discountPercent ? Number(p.discountPercent) : null,
    tariffDutyPercent: p.tariffDutyPercent ? Number(p.tariffDutyPercent) : null,
    coefNac: p.coefNac != null ? Number(p.coefNac) : null,
    coefVta: p.coefVta != null ? Number(p.coefVta) : null,
    coefVtaFob: p.coefVtaFob != null ? Number(p.coefVtaFob) : null,
    ivaPercent: p.ivaPercent != null ? Number(p.ivaPercent) : null,
    impIntPercent: p.impIntPercent != null ? Number(p.impIntPercent) : null,
  };
}

async function mapProductsToCatalogItems(
  products: ProductRow[],
  ctx: CatalogContext
): Promise<CatalogProduct[]> {
  if (products.length === 0) return [];

  const [wishlistItems, globalMargin] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: { wishlist: { userId: ctx.userId } },
      select: { productId: true },
    }),
    getGlobalMarginPercent(),
  ]);
  const favSet = new Set(wishlistItems.map((w) => w.productId));
  const prices = await calculatePricesForProducts(
    products.map(toPricingInput),
    ctx.commercialClientId,
    globalMargin
  );

  return products.map((p) => ({
    id: p.id,
    internalSku: p.internalSku,
    normalizedName: p.normalizedName,
    shortDescription: p.shortDescription,
    brandName: p.brand?.name ?? null,
    categoryName: p.category?.name ?? null,
    primaryImage: p.images[0]?.url ?? null,
    stockStatus: p.stockStatus,
    stockQuantity: p.stockQuantity,
    isCustomizable: p.isCustomizable,
    isCrestronHomeCompatible: p.isCrestronHomeCompatible,
    kind: p.kind,
    accessoryRequiredWithPrimary: p.accessoryRequiredWithPrimary,
    pricing: prices.get(p.id)!,
    isFavorite: favSet.has(p.id),
  }));
}

function passesPriceFilter(item: CatalogProduct, filters: CatalogFilters) {
  const price = item.pricing.finalPriceUsd;
  if (filters.minPrice != null && price < filters.minPrice) return false;
  if (filters.maxPrice != null && price > filters.maxPrice) return false;
  return true;
}

function sortCatalogItems(items: CatalogProduct[], sort: CatalogFilters["sort"]) {
  const copy = [...items];
  // Comparador secundario: PRINCIPAL siempre antes que ACCESORIO. El criterio
  // primario sigue siendo el sort que pidió el usuario.
  const kindWeight = (k: string | null | undefined) => (k === "ACCESORIO" ? 1 : 0);
  switch (sort) {
    case "price_asc":
      copy.sort(
        (a, b) =>
          kindWeight(a.kind) - kindWeight(b.kind) ||
          a.pricing.finalPriceUsd - b.pricing.finalPriceUsd
      );
      break;
    case "price_desc":
      copy.sort(
        (a, b) =>
          kindWeight(a.kind) - kindWeight(b.kind) ||
          b.pricing.finalPriceUsd - a.pricing.finalPriceUsd
      );
      break;
    case "name_desc":
      copy.sort(
        (a, b) =>
          kindWeight(a.kind) - kindWeight(b.kind) ||
          b.normalizedName.localeCompare(a.normalizedName, "es")
      );
      break;
    case "newest":
      copy.sort((a, b) => kindWeight(a.kind) - kindWeight(b.kind));
      break;
    default:
      copy.sort(
        (a, b) =>
          kindWeight(a.kind) - kindWeight(b.kind) ||
          a.normalizedName.localeCompare(b.normalizedName, "es")
      );
  }
  return copy;
}

const productInclude = {
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  images: { where: { isPrimary: true }, take: 1 },
} as const;

export async function getCatalog(
  filters: CatalogFilters,
  ctx: CatalogContext
): Promise<{ items: CatalogProduct[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(60, Math.max(12, filters.pageSize ?? 24));

  const where = await buildCatalogWhere(filters, ctx);
  if (!where) return { items: [], total: 0, page, pageSize };

  const needsPricePipeline =
    filters.minPrice != null ||
    filters.maxPrice != null ||
    filters.sort === "price_asc" ||
    filters.sort === "price_desc";

  // ORDEN PRIMARIO: kind ASC → PRINCIPAL sale primero, ACCESORIO después.
  // Esto asegura que en cualquier vista (búsqueda, navegación por filtros,
  // categoría puntual) los productos principales aparezcan arriba y los
  // accesorios al final. El usuario tiene que ver los items "que vende"
  // primero, no los complementos.
  if (needsPricePipeline) {
    const products = await prisma.product.findMany({
      where,
      take: CATALOG_FETCH_CAP,
      orderBy:
        filters.sort === "newest"
          ? [{ kind: "asc" }, { createdAt: "desc" }]
          : [{ kind: "asc" }, { normalizedName: "asc" }],
      include: productInclude,
    });

    let items = await mapProductsToCatalogItems(products, ctx);
    items = items.filter((i) => passesPriceFilter(i, filters));
    items = sortCatalogItems(items, filters.sort);
    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total, page, pageSize };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    filters.sort === "name_desc"
      ? [{ kind: "asc" }, { normalizedName: "desc" }]
      : filters.sort === "newest"
        ? [{ kind: "asc" }, { createdAt: "desc" }]
        : [{ kind: "asc" }, { normalizedName: "asc" }];

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: productInclude,
    }),
  ]);

  const items = await mapProductsToCatalogItems(products, ctx);
  return { items, total, page, pageSize };
}

function countFacet(map: Map<string, { name: string; count: number }>, id: string | null, name: string | null) {
  if (!id || !name) return;
  const prev = map.get(id);
  if (prev) prev.count += 1;
  else map.set(id, { name, count: 1 });
}

export async function getCatalogSidebarMeta(
  filters: CatalogFilters,
  ctx: CatalogContext,
  options?: { includeDistributors?: boolean }
): Promise<CatalogSidebarMeta> {
  const includeDistributors = options?.includeDistributors ?? ctx.isAdmin;
  const filtersNoPrice = { ...filters, minPrice: undefined, maxPrice: undefined };
  const where = await buildCatalogWhere(filtersNoPrice, ctx);
  if (!where) {
    return {
      priceBounds: { min: 0, max: 0 },
      brands: [],
      categories: [],
      families: [],
      distributors: [],
      stockCounts: { in_stock: 0, low_stock: 0, on_request: 0 },
      discountCount: 0,
      totalMatching: 0,
    };
  }

  const products = await prisma.product.findMany({
    where,
    take: CATALOG_FETCH_CAP,
    select: {
      id: true,
      baseCostUsd: true,
      brandId: true,
      brand: { select: { name: true } },
      categoryId: true,
      category: { select: { name: true } },
      familyId: true,
      family: { select: { name: true } },
      distributorId: true,
      distributor: { select: { name: true } },
      stockStatus: true,
      discountPercent: true,
      tariffDutyPercent: true,
      coefNac: true,
      coefVta: true,
      coefVtaFob: true,
      ivaPercent: true,
      impIntPercent: true,
    },
  });

  const globalMargin = await getGlobalMarginPercent();
  const prices = await calculatePricesForProducts(
    products.map((p) => ({
      productId: p.id,
      baseCostUsd: Number(p.baseCostUsd),
      brandId: p.brandId,
      distributorId: p.distributorId,
      categoryId: p.categoryId,
      familyId: p.familyId,
      productDiscountPercent: p.discountPercent ? Number(p.discountPercent) : null,
      tariffDutyPercent: null,
      coefNac: p.coefNac != null ? Number(p.coefNac) : null,
      coefVta: p.coefVta != null ? Number(p.coefVta) : null,
      coefVtaFob: p.coefVtaFob != null ? Number(p.coefVtaFob) : null,
      ivaPercent: p.ivaPercent != null ? Number(p.ivaPercent) : null,
      impIntPercent: p.impIntPercent != null ? Number(p.impIntPercent) : null,
    })),
    ctx.commercialClientId,
    globalMargin
  );

  const brandMap = new Map<string, { name: string; count: number }>();
  const categoryMap = new Map<string, { name: string; count: number }>();
  const familyMap = new Map<string, { name: string; count: number }>();
  const distributorMap = new Map<string, { name: string; count: number }>();
  const stockCounts = { in_stock: 0, low_stock: 0, on_request: 0 };
  let discountCount = 0;
  let priceMin = Infinity;
  let priceMax = 0;

  for (const p of products) {
    const price = prices.get(p.id)?.finalPriceUsd;
    if (price == null) continue;
    if (price < priceMin) priceMin = price;
    if (price > priceMax) priceMax = price;

    countFacet(brandMap, p.brandId, p.brand?.name ?? null);
    countFacet(categoryMap, p.categoryId, p.category?.name ?? null);
    countFacet(familyMap, p.familyId, p.family?.name ?? null);
    if (includeDistributors) countFacet(distributorMap, p.distributorId, p.distributor?.name ?? null);

    if (p.stockStatus === "IN_STOCK") stockCounts.in_stock += 1;
    else if (p.stockStatus === "LOW_STOCK") stockCounts.low_stock += 1;
    else if (p.stockStatus === "ON_REQUEST") stockCounts.on_request += 1;

    const breakdown = prices.get(p.id);
    if (breakdown && breakdown.discountPercent > 0) discountCount += 1;
  }

  const toSorted = (m: Map<string, { name: string; count: number }>): FacetOption[] =>
    [...m.entries()]
      .map(([id, v]) => ({ id, name: v.name, count: v.count }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

  if (!Number.isFinite(priceMin)) priceMin = 0;
  if (!Number.isFinite(priceMax)) priceMax = 0;

  return {
    priceBounds: { min: Math.floor(priceMin), max: Math.ceil(priceMax) },
    brands: toSorted(brandMap),
    categories: toSorted(categoryMap),
    families: toSorted(familyMap),
    distributors: toSorted(distributorMap),
    stockCounts,
    discountCount,
    totalMatching: products.length,
  };
}

/** @deprecated Usar getCatalogSidebarMeta */
export async function getCatalogFilterOptions() {
  const [brands, distributors, categories, families] = await Promise.all([
    prisma.brand.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.distributor.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.productFamily.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { brands, distributors, categories, families };
}
