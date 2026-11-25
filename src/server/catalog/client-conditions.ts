import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { calculatePricesForProducts, PRICING_PRODUCT_SELECT, toPricingInput } from "@/lib/pricing";
import { getVisibleProductsWhere } from "@/lib/catalog";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation/token";
import { CONDITIONS_COOKIE, pricesDiffer, resolveConditionsView, type ConditionsView } from "@/lib/client-conditions";

/** Lo que tarda en volver a mirarse si un cliente tiene condiciones propias. */
const CACHE_MS = 5 * 60_000;
const MAX_PRODUCTS_CHECKED = 4000;
const cache = new Map<string, { at: number; value: boolean }>();

/**
 * ¿La empresa tiene condiciones comerciales propias que le cambian el precio?
 * Primero mira si tiene reglas de margen o descuento a su nombre (rápido); si
 * las tiene, lo confirma con la cadena de precios real sobre lo que ve en el
 * catálogo: alguna diferencia contra el precio de lista alcanza.
 */
export async function clientHasOwnConditions(clientId: string): Promise<boolean> {
  const hit = cache.get(clientId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const [margins, discounts] = await Promise.all([
    prisma.marginRule.count({ where: { clientId, isActive: true } }),
    prisma.discountRule.count({ where: { clientId, isActive: true } }),
  ]);
  let value = false;
  if (margins + discounts > 0) {
    const where = await getVisibleProductsWhere({ commercialClientId: clientId, userId: null, isAdmin: false });
    const rows = await prisma.product.findMany({ where, select: PRICING_PRODUCT_SELECT, take: MAX_PRODUCTS_CHECKED });
    const inputs = rows.map(toPricingInput);
    const [list, withConditions] = await Promise.all([
      calculatePricesForProducts(inputs, null),
      calculatePricesForProducts(inputs, clientId),
    ]);
    value = pricesDiffer(list, withConditions);
  }
  cache.set(clientId, { at: Date.now(), value });
  return value;
}

/** Qué precio ve este usuario (lista o con sus condiciones) y si se le ofrece el control. */
export async function getConditionsView(userId: string, clientId: string | null): Promise<ConditionsView> {
  if (!clientId) return resolveConditionsView({ clientId: null, hasOwnConditions: false, cookieValue: undefined, userId });
  const [hasOwnConditions, store] = await Promise.all([clientHasOwnConditions(clientId), cookies()]);
  // «Ver como»: el admin ve los precios con las condiciones de la empresa (lo que el cliente paga);
  // la elección del cliente vive en su navegador y desde acá no se puede cambiar (solo lectura).
  const cookieValue = store.get(IMPERSONATION_COOKIE)?.value ? userId : store.get(CONDITIONS_COOKIE)?.value;
  return resolveConditionsView({ clientId, hasOwnConditions, cookieValue, userId });
}
