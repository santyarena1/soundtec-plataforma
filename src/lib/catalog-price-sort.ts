/**
 * Orden por precio del catálogo. Lo que no tiene precio (a consultar, sin
 * costo cargado o precio 0) va siempre al final, en los dos sentidos: si no,
 * «menor precio» arrancaba con productos sin precio (y casi siempre sin foto).
 */

export interface PriceSortable {
  requiresQuote: boolean;
  pricing: { finalPriceUsd: number } | null;
}

export function sortablePrice(item: PriceSortable): number | null {
  if (item.requiresQuote || !item.pricing) return null;
  const value = item.pricing.finalPriceUsd;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 0 si ambos tienen (o no tienen) precio; empuja al final al que no tiene. */
export function missingPriceLast(a: PriceSortable, b: PriceSortable): number {
  const pa = sortablePrice(a);
  const pb = sortablePrice(b);
  if ((pa === null) === (pb === null)) return 0;
  return pa === null ? 1 : -1;
}

export function compareByPrice(a: PriceSortable, b: PriceSortable, direction: "asc" | "desc"): number {
  const pa = sortablePrice(a) ?? 0;
  const pb = sortablePrice(b) ?? 0;
  return direction === "asc" ? pa - pb : pb - pa;
}
