import { calculatePricesForProducts } from "@/lib/pricing";
import { getGlobalMarginPercent } from "@/lib/settings";

type PricedProduct = {
  id: string;
  baseCostUsd: unknown;
  brandId: string | null;
  distributorId: string | null;
  categoryId: string | null;
  familyId: string | null;
  familia?: string | null;
  discountPercent?: unknown;
  tariffDutyPercent?: unknown;
  coefNac?: unknown;
  coefVta?: unknown;
  coefVtaFob?: unknown;
  ivaPercent?: unknown;
  impIntPercent?: unknown;
  salePriceUsd?: unknown;
};

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Precio de lista del motor (reglas de márgenes). Con o sin cliente. */
export async function quoteListUnitUsd(
  product: PricedProduct,
  clientId: string | null
): Promise<number> {
  const global = await getGlobalMarginPercent();
  const prices = await calculatePricesForProducts(
    [
      {
        productId: product.id,
        baseCostUsd: num(product.baseCostUsd) ?? 0,
        brandId: product.brandId,
        distributorId: product.distributorId,
        categoryId: product.categoryId,
        familyId: product.familyId,
        familia: product.familia ?? null,
        productDiscountPercent: num(product.discountPercent),
        tariffDutyPercent: num(product.tariffDutyPercent),
        coefNac: num(product.coefNac),
        coefVta: num(product.coefVta),
        coefVtaFob: num(product.coefVtaFob),
        ivaPercent: num(product.ivaPercent),
        impIntPercent: num(product.impIntPercent),
      },
    ],
    clientId,
    global
  );
  const unit = prices.get(product.id)?.finalPriceUsd;
  if (typeof unit === "number" && Number.isFinite(unit) && unit > 0) return unit;
  const sale = num(product.salePriceUsd);
  if (sale != null && sale > 0) return sale;
  return num(product.baseCostUsd) ?? 0;
}
