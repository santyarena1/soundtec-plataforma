import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { expandCategoryIds } from "@/lib/category-tree";
import { buildCategoryCountTree, type CategoryCountNode } from "@/lib/catalog-category-tree";
import {
  calculatePricesForProducts,
  getClientVisibility,
  type PriceBreakdown,
  type ProductPricingInput,
} from "@/lib/pricing";
import { getGlobalMarginPercent } from "@/lib/settings";
import { productCoverImageInclude } from "@/lib/product-cover-image";
import { hasConfigurator } from "@/lib/product-display";
import { compareByPrice, missingPriceLast } from "@/lib/catalog-price-sort";
import { buildProductSearchAnd, productTokenOr, searchRank } from "@/lib/product-search";
import { compareByRelevance, hasEnoughViews } from "@/lib/catalog-relevance";
import {
  brandsWithLogos,
  getBrandsWithoutProducts,
  loadCrestronHomeSettings,
  withCrestronHome,
  type CatalogBrand,
} from "@/lib/catalog-brands";
import { loadProductViewCounts } from "@/server/catalog/product-views";
import { SHOW_STOCK_TO_CUSTOMERS } from "@/lib/stock-display";
import { customerHiddenCategoryIds } from "@/lib/customer-hidden-categories";
import { customerCategoryName, isCustomerTreeNode } from "@/lib/tango-only";
import { brandListingComparator, categorySortKeys } from "@/lib/brand-listing-order";
import { MORE_FROM_SERIES_MAX, moreFromSeriesQuery, NO_SERIES } from "@/lib/product-lines/series-filter";

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
  return productTokenOr(tokens[0]);
}

function buildSearchAnd(search: string): Prisma.ProductWhereInput[] | undefined {
  return buildProductSearchAnd(search);
}

export interface CatalogFilters {
  search?: string;
  brandIds?: string[];
  distributorIds?: string[];
  categoryIds?: string[];
  /** Serie del fabricante (?line=). Reemplaza a la faceta de familias. */
  lineIds?: string[];
  stock?: "in_stock" | "low_stock" | "on_request" | "any";
  /** Por defecto el catálogo oculta los productos sin stock; true los muestra. */
  includeOutOfStock?: boolean;
  hasDiscount?: boolean;
  favoritesOnly?: boolean;
  crestronOnly?: boolean;
  kind?: "PRINCIPAL" | "ACCESORIO" | "any";
  minPrice?: number;
  maxPrice?: number;
  sort?: "relevance" | "price_asc" | "price_desc" | "name_asc" | "name_desc" | "newest";
  page?: number;
  pageSize?: number;
}

export interface CatalogProduct {
  id: string;
  internalSku: string | null;
  supplierSku: string | null;
  modelNumber: string | null;
  manufacturerItem: string | null;
  originalName: string;
  normalizedName: string;
  shortDescription: string | null;
  brandName: string | null;
  categoryName: string | null;
  /** Serie del fabricante (chip «Serie X» en la tarjeta). Nunca la familia vieja. */
  seriesName: string | null;
  primaryImage: string | null;
  /** Sin precio cargado (o marcado "a consultar"): se muestra "Precio a consultar". */
  requiresQuote: boolean;
  isDiscontinued: boolean;
  /** Cartel comercial elegido en el panel (A_PEDIDO, LIQUIDACION…); null = automático. */
  commercialTag: string | null;
  stockStatus: string;
  stockQuantity: number | null;
  isCustomizable: boolean;
  isCrestronHomeCompatible: boolean;
  /** Destacado (estrella): primero al entrar a su marca. */
  isFeatured: boolean;
  kind: "PRINCIPAL" | "ACCESORIO";
  accessoryRequiredWithPrimary: boolean;
  /** null en el catálogo público (sin precios). */
  pricing: PriceBreakdown | null;
  isFavorite: boolean;
}

export type FacetOption = { id: string; name: string; count: number };

export interface CatalogSidebarMeta {
  priceBounds: { min: number; max: number };
  brands: FacetOption[];
  categories: FacetOption[];
  series: FacetOption[];
  distributors: FacetOption[];
  stockCounts: { in_stock: number; low_stock: number; on_request: number; out_of_stock: number };
  discountCount: number;
  totalMatching: number;
}

const CATALOG_FETCH_CAP = 4000;

export type CatalogContext = {
  commercialClientId: string | null;
  /** null para visitantes sin sesión (catálogo público). */
  userId: string | null;
  isAdmin: boolean;
  /** Catálogo público: sin precios, sin stock, sin favoritos. */
  publicMode?: boolean;
};

type ProductRow = Prisma.ProductGetPayload<{
  include: {
    brand: { select: { id: true; name: true } };
    category: { select: { id: true; name: true } };
    series: { select: { id: true; name: true } };
    images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]; take: 1 };
    _count: { select: { options: true } };
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
  const [hidden, catalogHiddenBrands, filterCategoryIds, staffOnlyCategoryIds] = await Promise.all([
    resolveVisibility(ctx.commercialClientId, ctx.isAdmin),
    prisma.brand.findMany({ where: { hiddenFromCatalog: true }, select: { id: true } }),
    // Rubro elegido u oculto = ese nodo del árbol y todo lo que cuelga de él.
    expandCategoryIds(filters.categoryIds ?? []),
    // Rubros que solo ve el equipo (Indumentaria): fuera del portal del cliente y del catálogo público.
    ctx.isAdmin ? Promise.resolve([] as string[]) : customerHiddenCategoryIds(),
  ]);
  const hiddenCategoryIds = [...(await expandCategoryIds(hidden.hiddenCategoryIds)), ...staffOnlyCategoryIds];
  // Marcas ocultas (por visibilidad del cliente o desde Admin → Marcas) combinadas
  // con el filtro de marca: un `in` no puede pisar el `notIn`.
  const excludedBrandIds = [...hidden.hiddenBrandIds, ...catalogHiddenBrands.map((b) => b.id)];
  // `notIn` en SQL descarta los productos sin marca (NULL): con filtro de marca
  // no importa; sin filtro, se los vuelve a incluir con un OR.
  const brandFilter: Prisma.ProductWhereInput = filters.brandIds?.length
    ? { brandId: { in: filters.brandIds, ...(excludedBrandIds.length ? { notIn: excludedBrandIds } : {}) } }
    : excludedBrandIds.length
      ? { OR: [{ brandId: null }, { brandId: { notIn: excludedBrandIds } }] }
      : {};

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    ...(hidden.hiddenProductIds.length ? { id: { notIn: hidden.hiddenProductIds } } : {}),
    ...brandFilter,
    ...(hidden.hiddenDistributorIds.length ? { distributorId: { notIn: hidden.hiddenDistributorIds } } : {}),
    ...(hidden.hiddenFamilyIds.length ? { familyId: { notIn: hidden.hiddenFamilyIds } } : {}),
    ...(ctx.isAdmin && filters.distributorIds?.length
      ? { distributorId: { in: filters.distributorIds } }
      : {}),
    ...(filterCategoryIds.length ? { categoryId: { in: filterCategoryIds } } : {}),
    ...(filters.lineIds?.length ? { lineId: { in: filters.lineIds.filter((id) => id !== NO_SERIES) } } : {}),
    ...(filters.kind === "PRINCIPAL" ? { kind: "PRINCIPAL" } : {}),
    ...(filters.kind === "ACCESORIO" ? { kind: "ACCESORIO" } : {}),
    ...(filters.stock === "in_stock"
      ? { stockStatus: "IN_STOCK" }
      : filters.stock === "low_stock"
        ? { stockStatus: "LOW_STOCK" }
        : filters.stock === "on_request"
          ? { stockStatus: "ON_REQUEST" }
          : filters.includeOutOfStock || ctx.publicMode || !SHOW_STOCK_TO_CUSTOMERS
            ? {}
            : { stockStatus: { not: "OUT_OF_STOCK" } }),
    ...(filters.hasDiscount ? { discountPercent: { gt: 0 } } : {}),
    ...(filters.crestronOnly ? { isCrestronHomeCompatible: true } : {}),
    ...(filters.search
      ? (() => {
          const ands = buildSearchAnd(filters.search);
          return ands && ands.length > 0 ? { AND: ands } : {};
        })()
      : {}),
  };
  // Rubros ocultos: `notIn` en SQL descarta los productos sin rubro (NULL), así que se los vuelve a incluir.
  if (hiddenCategoryIds.length) {
    const categoryExclusion: Prisma.ProductWhereInput = { OR: [{ categoryId: null }, { categoryId: { notIn: hiddenCategoryIds } }] };
    const previous = where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : [];
    where.AND = [...previous, categoryExclusion];
  }
  // Mantenemos la referencia al builder OR para compatibilidad con otros llamadores.
  void buildSearchOr;

  if (filters.favoritesOnly && ctx.userId) {
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

/**
 * Productos que ve este usuario en la vista por defecto del catálogo:
 * aplica la visibilidad de su cliente y las marcas ocultas. Sirve para
 * cualquier total o listado que se le muestre fuera del catálogo.
 */
export async function getVisibleProductsWhere(ctx: CatalogContext): Promise<Prisma.ProductWhereInput> {
  return (await buildCatalogWhere({}, ctx)) ?? { isActive: true };
}

/**
 * Un cliente del portal sin reglas de visibilidad propias. Sirve para contar
 * "lo que ve un cliente" fuera del portal (login, activar cuenta): activos,
 * marcas no ocultas, sin los rubros que solo ve el equipo (Indumentaria).
 */
export const CUSTOMER_CATALOG_CONTEXT: CatalogContext = { commercialClientId: null, userId: null, isAdmin: false };

/** Mismo total que muestra el portal al entrar (grilla de marcas). */
export async function countCustomerVisibleProducts(): Promise<number> {
  return prisma.product.count({ where: await getVisibleProductsWhere(CUSTOMER_CATALOG_CONTEXT) });
}

/**
 * Marcas del catálogo de este usuario, sin leer ni cotizar cada producto.
 * La grilla y la barra solo necesitan cantidad y logo.
 */
export async function listVisibleCatalogBrands(ctx: CatalogContext): Promise<{ brands: CatalogBrand[]; total: number }> {
  const where = await getVisibleProductsWhere(ctx);
  const [groups, total, crestronHomeCount, settings, emptyBrands] = await Promise.all([
    prisma.product.groupBy({
      by: ["brandId"],
      where: { AND: [where, { brandId: { not: null } }] },
      _count: { _all: true },
    }),
    prisma.product.count({ where }),
    prisma.product.count({ where: { AND: [where, { isCrestronHomeCompatible: true }] } }),
    loadCrestronHomeSettings(),
    getBrandsWithoutProducts(),
  ]);
  const ids = groups.map((g) => g.brandId).filter((id): id is string => !!id);
  const rows = ids.length
    ? await prisma.brand.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const countById = new Map(groups.map((g) => [g.brandId, g._count._all]));
  const withLogos = await brandsWithLogos(
    rows.map((b) => ({ id: b.id, name: b.name, count: countById.get(b.id) ?? 0 }))
  );
  return {
    brands: [...withCrestronHome(withLogos, crestronHomeCount, settings), ...emptyBrands],
    total,
  };
}

/**
 * Árbol de rubros con la cantidad de productos que ve este usuario con los
 * filtros actuales, sin contar el filtro de rubro (así se puede pasar de uno a
 * otro). Cada nodo suma lo de sus subrubros. Para la columna de rubros del portal.
 */
export async function listCatalogCategoryTree(filters: CatalogFilters, ctx: CatalogContext): Promise<CategoryCountNode[]> {
  const where = await buildCatalogWhere({ ...filters, categoryIds: [], page: undefined }, ctx);
  if (!where) return [];
  const [groups, nodes] = await Promise.all([
    prisma.product.groupBy({ by: ["categoryId"], where: { AND: [where, { categoryId: { not: null } }] }, _count: { _all: true } }),
    prisma.category.findMany({ where: { tangoPath: { not: null } }, select: { id: true, name: true, parentId: true, tangoPath: true, slug: true } }),
  ]);
  return buildCategoryCountTree(
    // Solo rubros de Tango: ni categorías viejas ni «Sin categorizar» (sus productos siguen en búsquedas y por marca).
    nodes.filter(isCustomerTreeNode),
    groups.map((g) => ({ categoryId: g.categoryId, count: g._count._all }))
  );
}

/** Nombres de los filtros activos, para las pastillas. No recorre el catálogo. */
export async function catalogFilterMeta(filters: CatalogFilters): Promise<CatalogSidebarMeta> {
  const empty: CatalogSidebarMeta = {
    priceBounds: { min: 0, max: 0 },
    brands: [],
    categories: [],
    series: [],
    distributors: [],
    stockCounts: { in_stock: 0, low_stock: 0, on_request: 0, out_of_stock: 0 },
    discountCount: 0,
    totalMatching: 0,
  };
  const [brands, categories, series] = await Promise.all([
    filters.brandIds?.length
      ? prisma.brand.findMany({ where: { id: { in: filters.brandIds } }, select: { id: true, name: true } })
      : [],
    filters.categoryIds?.length
      ? prisma.category.findMany({ where: { id: { in: filters.categoryIds } }, select: { id: true, name: true } })
      : [],
    filters.lineIds?.length
      ? prisma.productLine.findMany({ where: { id: { in: filters.lineIds } }, select: { id: true, name: true } })
      : [],
  ]);
  return {
    ...empty,
    brands: brands.map((b) => ({ id: b.id, name: b.name, count: 0 })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, count: 0 })),
    series: series.map((s) => ({ id: s.id, name: s.name, count: 0 })),
  };
}

function toPricingInput(p: ProductRow): ProductPricingInput {
  return {
    productId: p.id,
    baseCostUsd: Number(p.baseCostUsd),
    brandId: p.brandId,
    distributorId: p.distributorId,
    categoryId: p.categoryId,
    familyId: p.familyId,
    familia: p.familia ?? null,
    productDiscountPercent: p.discountPercent ? Number(p.discountPercent) : null,
    tariffDutyPercent: p.tariffDutyPercent ? Number(p.tariffDutyPercent) : null,
    coefNac: p.coefNac != null ? Number(p.coefNac) : null,
    coefVta: p.coefVta != null ? Number(p.coefVta) : null,
    coefVtaFob: p.coefVtaFob != null ? Number(p.coefVtaFob) : null,
    ivaPercent: p.ivaPercent != null ? Number(p.ivaPercent) : null,
    impIntPercent: p.impIntPercent != null ? Number(p.impIntPercent) : null,
  };
}

/**
 * `withPricing` fuerza el cálculo de precios aunque sea el catálogo público:
 * se usa solo para ORDENAR por precio; getCatalog los borra antes de devolver.
 */
async function mapProductsToCatalogItems(
  products: ProductRow[],
  ctx: CatalogContext,
  options?: { withPricing?: boolean }
): Promise<CatalogProduct[]> {
  if (products.length === 0) return [];

  const [wishlistItems, globalMargin] = await Promise.all([
    ctx.userId
      ? prisma.wishlistItem.findMany({
          where: { wishlist: { userId: ctx.userId } },
          select: { productId: true },
        })
      : Promise.resolve([] as Array<{ productId: string }>),
    getGlobalMarginPercent(),
  ]);
  const favSet = new Set(wishlistItems.map((w) => w.productId));
  const prices = ctx.publicMode && !options?.withPricing
    ? new Map<string, PriceBreakdown>()
    : await calculatePricesForProducts(
        products.map(toPricingInput),
        ctx.commercialClientId,
        globalMargin
      );

  return products.map((p) => ({
    id: p.id,
    internalSku: p.internalSku,
    supplierSku: p.supplierSku,
    modelNumber: p.modelNumber,
    manufacturerItem: p.manufacturerItem,
    originalName: p.originalName,
    normalizedName: p.normalizedName,
    shortDescription: p.shortDescription,
    brandName: p.brand?.name ?? null,
    categoryName: customerCategoryName(p.category),
    seriesName: p.series?.name ?? null,
    primaryImage: p.images[0]?.url ?? null,
    requiresQuote: p.requiresQuote,
    isDiscontinued: p.isDiscontinued,
    commercialTag: p.commercialTag,
    stockStatus: p.stockStatus,
    stockQuantity: p.stockQuantity,
    // «Configurable» solo con opciones reales (ver hasConfigurator).
    isCustomizable: hasConfigurator({ isCustomizable: p.isCustomizable, optionCount: p._count.options }),
    isCrestronHomeCompatible: p.isCrestronHomeCompatible,
    isFeatured: p.isFeatured,
    kind: p.kind,
    accessoryRequiredWithPrimary: p.accessoryRequiredWithPrimary,
    pricing: prices.get(p.id) ?? null,
    isFavorite: favSet.has(p.id),
  }));
}

function passesPriceFilter(item: CatalogProduct, filters: CatalogFilters) {
  if (!item.pricing) return true;
  const price = item.pricing.finalPriceUsd;
  if (filters.minPrice != null && price < filters.minPrice) return false;
  if (filters.maxPrice != null && price > filters.maxPrice) return false;
  return true;
}

function sortCatalogItems(
  items: CatalogProduct[],
  sort: CatalogFilters["sort"],
  search?: string,
  viewData?: { views: Map<string, number>; total: number }
) {
  const copy = [...items];
  // Con búsqueda, la relevancia manda: título/SKU antes que contenido.
  const query = search?.trim() ?? "";
  const rankOf = new Map<string, number>();
  if (query) {
    for (const item of items) {
      rankOf.set(
        item.id,
        searchRank(
          {
            normalizedName: item.normalizedName,
            internalSku: item.internalSku,
            brandName: item.brandName,
            modelNumber: item.modelNumber,
            manufacturerItem: item.manufacturerItem,
            supplierSku: item.supplierSku,
            originalName: item.originalName,
          },
          query
        )
      );
    }
  }
  const relevance = (a: CatalogProduct, b: CatalogProduct) =>
    query ? (rankOf.get(a.id) ?? 3) - (rankOf.get(b.id) ?? 3) : 0;
  // Comparador secundario: PRINCIPAL siempre antes que ACCESORIO. El criterio
  // primario sigue siendo el sort que pidió el usuario.
  const kindWeight = (k: string | null | undefined) => (k === "ACCESORIO" ? 1 : 0);
  const price = (item: CatalogProduct) => item.pricing?.finalPriceUsd ?? 0;
  switch (sort) {
    case "relevance": {
      const byRelevance = compareByRelevance(viewData?.views ?? new Map(), hasEnoughViews(viewData?.total ?? 0));
      const asRelevance = (item: CatalogProduct) => ({
        id: item.id,
        isCrestronHomeCompatible: item.isCrestronHomeCompatible,
        price: price(item),
      });
      copy.sort((a, b) => relevance(a, b) || byRelevance(asRelevance(a), asRelevance(b)));
      break;
    }
    // Sin precio al final en los dos sentidos (ver lib/catalog-price-sort).
    case "price_asc":
      copy.sort(
        (a, b) =>
          relevance(a, b) || missingPriceLast(a, b) || kindWeight(a.kind) - kindWeight(b.kind) || compareByPrice(a, b, "asc")
      );
      break;
    case "price_desc":
      copy.sort(
        (a, b) =>
          relevance(a, b) || missingPriceLast(a, b) || kindWeight(a.kind) - kindWeight(b.kind) || compareByPrice(a, b, "desc")
      );
      break;
    case "name_desc":
      copy.sort(
        (a, b) =>
          relevance(a, b) ||
          kindWeight(a.kind) - kindWeight(b.kind) ||
          b.normalizedName.localeCompare(a.normalizedName, "es")
      );
      break;
    case "newest":
      copy.sort((a, b) => relevance(a, b) || kindWeight(a.kind) - kindWeight(b.kind));
      break;
    default:
      copy.sort(
        (a, b) =>
          relevance(a, b) ||
          kindWeight(a.kind) - kindWeight(b.kind) ||
          a.normalizedName.localeCompare(b.normalizedName, "es")
      );
  }
  return copy;
}

const productInclude = {
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  series: { select: { id: true, name: true } },
  images: productCoverImageInclude,
  _count: { select: { options: true } },
} as const;

let categoryKeysCache: { at: number; rows: ReturnType<typeof categorySortKeys> } | null = null;

/**
 * Orden de rubros de la marca abierta (una sola marca, orden «Más relevantes»).
 * null = no se está mirando una marca: queda el orden de siempre.
 */
async function loadBrandListingOrder(filters: CatalogFilters) {
  const brandId = filters.brandIds?.length === 1 ? filters.brandIds[0] : null;
  if (!brandId || filters.crestronOnly) return null;
  if (!categoryKeysCache || Date.now() - categoryKeysCache.at > 5 * 60_000) {
    const rows = await prisma.category.findMany({ select: { id: true, parentId: true, name: true, tangoPath: true } });
    categoryKeysCache = { at: Date.now(), rows: categorySortKeys(rows) };
  }
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { categoryOrder: true } });
  return { categoryOrder: brand?.categoryOrder ?? [], categories: categoryKeysCache.rows };
}

export async function getCatalog(
  filters: CatalogFilters,
  ctx: CatalogContext
): Promise<{ items: CatalogProduct[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(60, Math.max(12, filters.pageSize ?? 24));

  const where = await buildCatalogWhere(filters, ctx);
  if (!where) return { items: [], total: 0, page, pageSize };

  const hasSearch = !!filters.search?.trim();
  const sortsByPrice = filters.sort === "price_asc" || filters.sort === "price_desc";
  const needsPricePipeline =
    hasSearch ||
    sortsByPrice ||
    (!ctx.publicMode && (filters.minPrice != null || filters.maxPrice != null));

  // "Más relevantes" sin búsqueda: se ordena una lista liviana (id, Crestron
  // Home, costo) y recién después se cargan los productos de la página.
  if (!hasSearch && filters.sort === "relevance") {
    const start = (page - 1) * pageSize;
    const [rows, viewData, brandOrder] = await Promise.all([
      prisma.product.findMany({
        where,
        select: { id: true, isCrestronHomeCompatible: true, baseCostUsd: true, isFeatured: true, categoryId: true },
      }),
      loadProductViewCounts(),
      loadBrandListingOrder(filters),
    ]);
    // El costo base ordena igual que el precio dentro de una misma marca (mismo
    // markup), que es lo que importa para "Crestron Home de mayor a menor".
    const byRelevance = compareByRelevance(viewData.views, hasEnoughViews(viewData.total));
    type Light = { id: string; isCrestronHomeCompatible: boolean; price: number; isFeatured: boolean; categoryId: string | null };
    // Dentro de una marca: destacados primero y agrupado por rubro (ver lib/brand-listing-order).
    const comparator = brandOrder
      ? brandListingComparator<Light>({ ...brandOrder, fallback: byRelevance })
      : byRelevance;
    const ordered = rows
      .map((r): Light => ({
        id: r.id,
        isCrestronHomeCompatible: r.isCrestronHomeCompatible,
        price: Number(r.baseCostUsd),
        isFeatured: r.isFeatured,
        categoryId: r.categoryId,
      }))
      .sort(comparator);
    const pageIds = ordered.slice(start, start + pageSize).map((r) => r.id);
    const products = await prisma.product.findMany({ where: { id: { in: pageIds } }, include: productInclude });
    const byId = new Map(products.map((p) => [p.id, p]));
    const pageProducts = pageIds.map((id) => byId.get(id)).filter((p): p is ProductRow => !!p);
    const items = await mapProductsToCatalogItems(pageProducts, ctx);
    return { items, total: ordered.length, page, pageSize };
  }

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

    // En el público los precios se calculan solo para ordenar y se borran abajo.
    const withPricing = ctx.publicMode && (sortsByPrice || filters.sort === "relevance");
    let items = await mapProductsToCatalogItems(products, ctx, { withPricing });
    if (!ctx.publicMode) items = items.filter((i) => passesPriceFilter(i, filters));
    const viewData = filters.sort === "relevance" ? await loadProductViewCounts() : undefined;
    items = sortCatalogItems(items, filters.sort, filters.search, viewData);
    const total = items.length;
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);
    return {
      items: ctx.publicMode ? pageItems.map((i) => ({ ...i, pricing: null })) : pageItems,
      total,
      page,
      pageSize,
    };
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

/** Recorre y cotiza el catálogo. La grilla usa listVisibleCatalogBrands; las pastillas, catalogFilterMeta. */
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
      series: [],
      distributors: [],
      stockCounts: { in_stock: 0, low_stock: 0, on_request: 0, out_of_stock: 0 },
      discountCount: 0,
      totalMatching: 0,
    };
  }
  // Cuántos "sin stock" quedan ocultos por el toggle (misma consulta, sin la exclusión).
  const hidesOutOfStock =
    SHOW_STOCK_TO_CUSTOMERS &&
    !filtersNoPrice.includeOutOfStock &&
    !ctx.publicMode &&
    (!filtersNoPrice.stock || filtersNoPrice.stock === "any");
  const outOfStockHidden = hidesOutOfStock
    ? await prisma.product.count({ where: { ...where, stockStatus: "OUT_OF_STOCK" } })
    : 0;

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
      familia: true,
      lineId: true,
      series: { select: { name: true } },
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
  const prices = ctx.publicMode
    ? new Map<string, PriceBreakdown>()
    : await calculatePricesForProducts(
    products.map((p) => ({
      productId: p.id,
      baseCostUsd: Number(p.baseCostUsd),
      brandId: p.brandId,
      distributorId: p.distributorId,
      categoryId: p.categoryId,
      familyId: p.familyId,
      familia: p.familia ?? null,
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
  const seriesMap = new Map<string, { name: string; count: number }>();
  const distributorMap = new Map<string, { name: string; count: number }>();
  const stockCounts = { in_stock: 0, low_stock: 0, on_request: 0, out_of_stock: outOfStockHidden };
  let discountCount = 0;
  let priceMin = Infinity;
  let priceMax = 0;

  for (const p of products) {
    const price = prices.get(p.id)?.finalPriceUsd;
    if (price != null) {
      if (price < priceMin) priceMin = price;
      if (price > priceMax) priceMax = price;
    }

    countFacet(brandMap, p.brandId, p.brand?.name ?? null);
    countFacet(categoryMap, p.categoryId, p.category?.name ?? null);
    countFacet(seriesMap, p.lineId, p.series?.name ?? null);
    if (includeDistributors) countFacet(distributorMap, p.distributorId, p.distributor?.name ?? null);

    if (p.stockStatus === "IN_STOCK") stockCounts.in_stock += 1;
    else if (p.stockStatus === "LOW_STOCK") stockCounts.low_stock += 1;
    else if (p.stockStatus === "ON_REQUEST") stockCounts.on_request += 1;
    else if (p.stockStatus === "OUT_OF_STOCK") stockCounts.out_of_stock += 1;

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
    series: toSorted(seriesMap),
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

/**
 * Series de la marca abierta, con cuántos productos ve este usuario con los
 * filtros actuales (sin contar el filtro de serie, así se puede pasar de una a
 * otra). Solo con una marca elegida; para el filtro «Serie» de la marca.
 */
export async function listBrandSeriesFacet(filters: CatalogFilters, ctx: CatalogContext): Promise<FacetOption[]> {
  if (filters.brandIds?.length !== 1 || filters.crestronOnly) return [];
  const where = await buildCatalogWhere({ ...filters, lineIds: [], page: undefined }, ctx);
  if (!where) return [];
  const groups = await prisma.product.groupBy({ by: ["lineId"], where: { AND: [where, { lineId: { not: null } }] }, _count: { _all: true } });
  const ids = groups.map((g) => g.lineId).filter((id): id is string => !!id);
  if (!ids.length) return [];
  const rows = await prisma.productLine.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const count = new Map(groups.map((g) => [g.lineId, g._count._all]));
  return rows.map((r) => ({ id: r.id, name: r.name, count: count.get(r.id) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name, "es"));
}


/**
 * «Más de la serie X» en la ficha: hasta 8 productos de la misma serie y marca
 * que este usuario puede ver (visibilidad del cliente, marcas y rubros ocultos),
 * sin el producto abierto. Principales primero, después por nombre.
 */
export async function getMoreFromSeries(
  product: { id: string; lineId: string | null; brandId: string | null },
  ctx: CatalogContext,
  limit = MORE_FROM_SERIES_MAX
): Promise<CatalogProduct[]> {
  const q = moreFromSeriesQuery(product, limit);
  if (!q) return [];
  const where = await buildCatalogWhere({ brandIds: q.brandIds, lineIds: q.lineIds, includeOutOfStock: true }, ctx);
  if (!where) return [];
  const rows = await prisma.product.findMany({
    where: { AND: [where, { id: { not: q.excludeId } }] },
    orderBy: [{ kind: "asc" }, { isFeatured: "desc" }, { normalizedName: "asc" }],
    take: q.take,
    include: productInclude,
  });
  const items = await mapProductsToCatalogItems(rows, ctx);
  return ctx.publicMode ? items.map((i) => ({ ...i, pricing: null })) : items;
}
