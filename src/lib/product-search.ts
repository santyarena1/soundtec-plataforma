import { Prisma } from "@prisma/client";
import { normalizeForSearch } from "@/lib/search-key";

/**
 * Búsqueda extendida de productos: nombre, SKU, descripciones, marca,
 * categoría, familia, etc. Multi-token con AND (todas las palabras deben matchear).
 */
/** Un token contra todos los campos buscables (OR interno). */
export function productTokenOr(token: string): NonNullable<Prisma.ProductWhereInput["OR"]> {
  const c = { contains: token, mode: "insensitive" as const };
  const normalizedToken = normalizeForSearch(token);
  return [
    { normalizedName: c },
    { originalName: c },
    { internalSku: c },
    { supplierSku: c },
    ...(normalizedToken ? [{ searchKey: { contains: normalizedToken } } as Prisma.ProductWhereInput] : []),
    { shortDescription: c },
    { longDescription: c },
    { tariffPosition: c },
    { coo: c },
    { modelNumber: c },
    { manufacturerItem: c },
    { productLine: c },
    { brand: { name: c } },
    { category: { name: c } },
    { family: { name: c } },
    { distributor: { name: c } },
  ];
}

/** Filtros AND por token para usar dentro de `where: { AND: [...] }`. */
export function buildProductSearchAnd(search: string): Prisma.ProductWhereInput[] | undefined {
  const tokens = search
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return undefined;
  return tokens.map((t) => ({ OR: productTokenOr(t) }));
}

/** `where` listo para `prisma.product.findMany({ where: { isActive: true, ...w } })`. */
export function buildProductSearchWhere(search: string): Prisma.ProductWhereInput {
  const ands = buildProductSearchAnd(search);
  if (!ands?.length) return {};
  return { AND: ands };
}
