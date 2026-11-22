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

/**
 * El filtro «Serie» de la página de una marca aparece solo si hay una sola
 * marca elegida y esa marca tiene 2 o más series con productos visibles.
 */
export function shouldShowSeriesFilter(brandIds: string[] | undefined, seriesCount: number): boolean {
  return (brandIds?.length ?? 0) === 1 && seriesCount >= 2;
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
