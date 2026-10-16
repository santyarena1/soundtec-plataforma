/**
 * Precio de venta general (sin condiciones de un cliente) de los productos
 * que muestra el Room Builder. Nunca el costo: el diseñador de salas lo usa
 * el equipo de ventas y el precio que ve es el que se cotiza.
 */

import { prisma } from "@/lib/prisma";
import { calculatePricesForProducts } from "@/lib/pricing";
import { getGlobalMarginPercent } from "@/lib/settings";

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** id → precio de venta en USD, o null si no tiene precio (costo 0 o "a consultar"). */
export async function salePricesFor(productIds: string[]): Promise<Map<string, number | null>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  const out = new Map<string, number | null>();
  if (!ids.length) return out;
  const [rows, globalMargin] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        baseCostUsd: true,
        requiresQuote: true,
        brandId: true,
        distributorId: true,
        categoryId: true,
        familyId: true,
        familia: true,
        discountPercent: true,
        tariffDutyPercent: true,
        coefNac: true,
        coefVta: true,
        coefVtaFob: true,
        ivaPercent: true,
        impIntPercent: true,
      },
    }),
    getGlobalMarginPercent(),
  ]);
  const prices = await calculatePricesForProducts(
    rows.map((p) => ({
      productId: p.id,
      baseCostUsd: num(p.baseCostUsd) ?? 0,
      brandId: p.brandId,
      distributorId: p.distributorId,
      categoryId: p.categoryId,
      familyId: p.familyId,
      familia: p.familia ?? null,
      productDiscountPercent: num(p.discountPercent),
      tariffDutyPercent: num(p.tariffDutyPercent),
      coefNac: num(p.coefNac),
      coefVta: num(p.coefVta),
      coefVtaFob: num(p.coefVtaFob),
      ivaPercent: num(p.ivaPercent),
      impIntPercent: num(p.impIntPercent),
    })),
    null,
    globalMargin
  );
  for (const p of rows) {
    const final = prices.get(p.id)?.finalPriceUsd;
    out.set(p.id, !p.requiresQuote && typeof final === "number" && final > 0 ? Math.round(final * 100) / 100 : null);
  }
  return out;
}

/**
 * Reemplaza `priceUsd` (que en los servicios se arma con el costo para
 * ordenar por precio) por el precio de venta, antes de mandarlo a la pantalla.
 */
export async function withSalePrices<T extends { priceUsd?: number | null }>(items: T[], idOf: (item: T) => string | null | undefined): Promise<T[]> {
  const prices = await salePricesFor(items.map((i) => idOf(i) ?? "").filter(Boolean));
  return items.map((i) => {
    const id = idOf(i);
    return id ? { ...i, priceUsd: prices.get(id) ?? null } : { ...i, priceUsd: null };
  });
}
