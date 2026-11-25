/**
 * «Este precio incluye un descuento»: para el admin (listado y ficha), de
 * cuánto es, el precio sin descuento y de dónde sale.
 */

export type DiscountOrigin = "PRODUCT" | "RULE" | "CLIENT";

export interface DiscountInfo {
  percent: number;
  /** Precio de lista (antes del descuento), en USD. */
  listPriceUsd: number;
  origin: DiscountOrigin;
  /** Nombre de la regla, si sale de una regla. */
  ruleName: string | null;
  /** «producto», «regla «Sonance 10 %»», «cliente: regla …». */
  originLabel: string;
}

interface BreakdownLike {
  discountPercent: number;
  priceBeforeDiscountUsd: number;
  discountSource: "RULE" | "PRODUCT" | null;
  appliedDiscountRule: { name: string; clientId?: string | null } | null;
}

/** null si el precio no tiene descuento. */
export function discountInfoFrom(breakdown: BreakdownLike | null | undefined): DiscountInfo | null {
  if (!breakdown || !(breakdown.discountPercent > 0) || !breakdown.discountSource) return null;
  const percent = Math.round(breakdown.discountPercent * 100) / 100;
  if (breakdown.discountSource === "PRODUCT") {
    return {
      percent,
      listPriceUsd: breakdown.priceBeforeDiscountUsd,
      origin: "PRODUCT",
      ruleName: null,
      originLabel: "descuento propio del producto",
    };
  }
  const rule = breakdown.appliedDiscountRule;
  const isClient = Boolean(rule?.clientId);
  return {
    percent,
    listPriceUsd: breakdown.priceBeforeDiscountUsd,
    origin: isClient ? "CLIENT" : "RULE",
    ruleName: rule?.name ?? null,
    originLabel: `${isClient ? "condición del cliente" : "regla de descuento"}${rule?.name ? ` «${rule.name}»` : ""}`,
  };
}

export function formatDiscountPercent(percent: number): string {
  return `${percent.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
}
