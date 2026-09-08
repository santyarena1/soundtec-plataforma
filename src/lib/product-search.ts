import { Prisma } from "@prisma/client";
import { normalizeForSearch } from "@/lib/search-key";

/**
 * Búsqueda extendida de productos: nombre, SKU, descripciones, contenido
 * enriquecido, marca, categoría, familia, etc. Multi-token con AND (todas las
 * palabras deben matchear en algún campo).
 *
 * El orden de resultados NO lo da la base: usar `sortBySearchRelevance` para
 * que primero salgan los que coinciden en título/SKU y después los que solo
 * coinciden en el contenido.
 */

export function searchTokens(search: string): string[] {
  return search
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Un token contra todos los campos buscables (OR interno). */
export function productTokenOr(token: string): NonNullable<Prisma.ProductWhereInput["OR"]> {
  const c = { contains: token, mode: "insensitive" as const };
  const normalizedToken = normalizeForSearch(token);
  return [
    // Título / identificadores
    { normalizedName: c },
    { originalName: c },
    { internalSku: c },
    { supplierSku: c },
    { modelNumber: c },
    { manufacturerItem: c },
    { productLine: c },
    ...(normalizedToken ? [{ searchKey: { contains: normalizedToken } } as Prisma.ProductWhereInput] : []),
    // Contenido
    { shortDescription: c },
    { longDescription: c },
    { htmlContent: c },
    { metaKeywords: c },
    { sourceCategoryPath: c },
    { familia: c },
    { tipo: c },
    { tariffPosition: c },
    { coo: c },
    // Relaciones
    { brand: { name: c } },
    { category: { name: c } },
    { family: { name: c } },
    { distributor: { name: c } },
  ];
}

/** Filtros AND por token para usar dentro de `where: { AND: [...] }`. */
export function buildProductSearchAnd(search: string): Prisma.ProductWhereInput[] | undefined {
  const tokens = searchTokens(search);
  if (tokens.length === 0) return undefined;
  return tokens.map((t) => ({ OR: productTokenOr(t) }));
}

/** `where` listo para `prisma.product.findMany({ where: { isActive: true, ...w } })`. */
export function buildProductSearchWhere(search: string): Prisma.ProductWhereInput {
  const ands = buildProductSearchAnd(search);
  if (!ands?.length) return {};
  return { AND: ands };
}

/** Campos mínimos para calcular relevancia (todos opcionales salvo el nombre). */
export interface SearchRankable {
  normalizedName: string;
  originalName?: string | null;
  internalSku?: string | null;
  supplierSku?: string | null;
  modelNumber?: string | null;
  manufacturerItem?: string | null;
  brandName?: string | null;
}

/** Select de Prisma con los campos que necesita `searchRank`. */
export const SEARCH_RANK_SELECT = {
  normalizedName: true,
  originalName: true,
  internalSku: true,
  supplierSku: true,
  modelNumber: true,
  manufacturerItem: true,
} as const;

function fold(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Relevancia de un producto para una búsqueda (menor = mejor):
 *  0 — el texto completo aparece en el nombre o coincide con un SKU/modelo
 *  1 — todas las palabras aparecen en nombre/SKU/modelo/marca
 *  2 — alguna palabra aparece en nombre/SKU/modelo/marca
 *  3 — solo coincide en el contenido (descripciones, specs, etc.)
 */
export function searchRank(item: SearchRankable, search: string): number {
  const query = fold(search).trim();
  if (!query) return 3;
  const tokens = query.split(/\s+/).filter(Boolean);
  const name = fold(item.normalizedName) + " " + fold(item.originalName);
  const ids = [item.internalSku, item.supplierSku, item.modelNumber, item.manufacturerItem]
    .map(fold)
    .filter(Boolean);
  const title = `${name} ${ids.join(" ")} ${fold(item.brandName)}`;

  const compactQuery = query.replace(/[\s-]/g, "");
  if (name.includes(query)) return 0;
  if (ids.some((id) => id === query || id.replace(/[\s-]/g, "") === compactQuery)) return 0;

  const hits = tokens.filter((token) => title.includes(token)).length;
  if (hits === tokens.length) return 1;
  if (hits > 0) return 2;
  return 3;
}

/** Ordena por relevancia (estable: mantiene el orden previo dentro de cada rango). */
export function sortBySearchRelevance<T>(
  items: T[],
  search: string,
  pick: (item: T) => SearchRankable
): T[] {
  if (!search.trim()) return items;
  return items
    .map((item, index) => ({ item, index, rank: searchRank(pick(item), search) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}
