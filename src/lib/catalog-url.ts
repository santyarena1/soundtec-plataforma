import type { CatalogFilters } from "@/lib/catalog";

export type CatalogView = "grid" | "table";

export interface CatalogUrlState extends CatalogFilters {
  view: CatalogView;
}

function toList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v];
}

function parseNum(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function parseCatalogSearchParams(
  params: Record<string, string | string[] | undefined>
): CatalogUrlState {
  const stock = params.stock as string | undefined;
  const kind = params.kind as string | undefined;

  return {
    search: typeof params.q === "string" ? params.q : undefined,
    brandIds: toList(params.brand),
    distributorIds: toList(params.distributor),
    categoryIds: toList(params.category),
    familyIds: toList(params.family),
    stock:
      stock === "in_stock" || stock === "low_stock" || stock === "on_request" ? stock : "any",
    hasDiscount: params.discount === "1",
    favoritesOnly: params.fav === "1",
    crestronOnly: params.crestron === "1",
    kind: kind === "PRINCIPAL" || kind === "ACCESORIO" ? kind : "any",
    minPrice: parseNum(typeof params.minPrice === "string" ? params.minPrice : undefined),
    maxPrice: parseNum(typeof params.maxPrice === "string" ? params.maxPrice : undefined),
    sort: (params.sort as CatalogFilters["sort"]) || "name_asc",
    page: params.page ? Number(params.page) : 1,
    view: params.view === "table" ? "table" : "grid",
  };
}

export function countActiveCatalogFilters(
  state: CatalogUrlState,
  options?: { includeDistributors?: boolean }
): number {
  let n = 0;
  if (state.search?.trim()) n += 1;
  if (state.brandIds?.length) n += 1;
  if (state.categoryIds?.length) n += 1;
  if (state.familyIds?.length) n += 1;
  if (options?.includeDistributors && state.distributorIds?.length) n += 1;
  if (state.stock && state.stock !== "any") n += 1;
  if (state.hasDiscount) n += 1;
  if (state.favoritesOnly) n += 1;
  if (state.crestronOnly) n += 1;
  if (state.kind && state.kind !== "any") n += 1;
  if (state.minPrice != null || state.maxPrice != null) n += 1;
  return n;
}
