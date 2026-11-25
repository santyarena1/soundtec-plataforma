import type { Prisma } from "@prisma/client";

/** Valor del filtro que pide los productos SIN serie (solo admin). */
export const NO_SERIES = "none";

/**
 * Filtro por serie (?line=): ids de ProductLine; «none» suma los productos sin
 * serie. Va dentro de un AND (lleva su propio OR).
 */
export function seriesFilterWhere(lineIds: string[]): Prisma.ProductWhereInput {
  const ids = [...new Set(lineIds.filter((id) => id && id !== NO_SERIES))];
  const withoutSeries = lineIds.includes(NO_SERIES);
  if (withoutSeries && ids.length) return { OR: [{ lineId: { in: ids } }, { lineId: null }] };
  if (withoutSeries) return { lineId: null };
  return { lineId: { in: ids } };
}

/** Se está mirando una marca o un grupo de marcas (también Crestron Home, que filtra por compatibilidad). */
export function isBrandScope(scope: { brandIds?: string[]; crestronOnly?: boolean }): boolean {
  return (scope.brandIds?.length ?? 0) > 0 || !!scope.crestronOnly;
}

/**
 * El filtro «Series» (columna izquierda, debajo de Rubros) aparece cuando se
 * mira una marca o un grupo de marcas y entre los resultados hay 2 o más series.
 */
export function shouldShowSeriesFilter(scope: { brandIds?: string[]; crestronOnly?: boolean }, seriesCount: number): boolean {
  return isBrandScope(scope) && seriesCount >= 2;
}

/**
 * Series para el filtro, por nombre. En un grupo de marcas dos series pueden
 * llamarse igual: a esas se les suma la marca («Serie · Marca»).
 */
export function seriesFacetOptions(
  rows: ReadonlyArray<{ id: string; name: string; brandName: string; count: number }>
): Array<{ id: string; name: string; count: number }> {
  const key = (name: string) => name.trim().toLowerCase();
  const times = new Map<string, number>();
  for (const row of rows) times.set(key(row.name), (times.get(key(row.name)) ?? 0) + 1);
  return rows
    .map((row) => ({ id: row.id, name: (times.get(key(row.name)) ?? 0) > 1 ? `${row.name} · ${row.brandName}` : row.name, count: row.count }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export const MORE_FROM_SERIES_MAX = 8;

/**
 * Qué buscar para «Más de la serie X»: misma serie y misma marca, sin el
 * producto abierto, hasta 8. null = el producto no tiene serie (no hay bloque).
 * La visibilidad del cliente la agrega el catálogo (mismo where que el portal).
 */
export function moreFromSeriesQuery(
  product: { id: string; lineId: string | null; brandId: string | null },
  limit = MORE_FROM_SERIES_MAX
): { brandIds: string[]; lineIds: string[]; excludeId: string; take: number } | null {
  if (!product.lineId || !product.brandId) return null;
  return { brandIds: [product.brandId], lineIds: [product.lineId], excludeId: product.id, take: Math.max(0, Math.min(limit, MORE_FROM_SERIES_MAX)) };
}
