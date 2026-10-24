import { calculatePricesForProducts, toPricingInput } from "@/lib/pricing";
import { getGlobalMarginPercent } from "@/lib/settings";

type QuotablePricedProduct = Parameters<typeof toPricingInput>[0] & { requiresQuote?: boolean | null };

/**
 * Precio unitario de venta para una cotización. Es el MISMO para la rápida, la
 * completa, la que viene de un pedido y la de Room Builder: el del motor de
 * precios con las condiciones del cliente. Si el producto es «a consultar» o el
 * motor da 0, queda en 0 y la planilla avisa «sin precio» (nunca el costo ni la
 * oferta del fabricante como precio de venta).
 */
export async function quoteUnitPrices(products: QuotablePricedProduct[], clientId: string | null): Promise<Map<string, number>> {
  if (!products.length) return new Map();
  const prices = await calculatePricesForProducts(products.map(toPricingInput), clientId, await getGlobalMarginPercent());
  return new Map(
    products.map((product) => {
      const unit = prices.get(product.id)?.finalPriceUsd;
      const valid = !product.requiresQuote && typeof unit === "number" && Number.isFinite(unit) && unit > 0;
      return [product.id, valid ? unit : 0] as const;
    })
  );
}

/** Precio de un solo producto (ver quoteUnitPrices). */
export async function quoteListUnitUsd(product: QuotablePricedProduct, clientId: string | null): Promise<number> {
  return (await quoteUnitPrices([product], clientId)).get(product.id) ?? 0;
}
