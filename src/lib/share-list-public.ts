// Lista compartida pública (/lista/[slug]): lo único que cruza al navegador.
// El precio llega calculado desde el servidor; costo, margen, coeficiente, TC,
// nombre de regla y stock (si la lista no lo muestra) nunca salen de acá.

export interface ShareListSourceItem {
  id: string;
  name: string;
  sku: string | null;
  shortDescription: string | null;
  brandName: string | null;
  categoryName: string | null;
  stockStatus: string;
  stockQuantity: number | null;
  imageUrl: string | null;
  pricing: { finalPriceUsd: number; priceBeforeDiscountUsd: number; discountPercent: number } | null;
}

export interface PublicShareListItem {
  id: string;
  name: string;
  sku: string | null;
  shortDescription: string | null;
  brandName: string | null;
  categoryName: string | null;
  imageUrl: string | null;
  /** Solo cuando la lista muestra stock. */
  stock: { status: string; quantity: number | null } | null;
  /** Solo cuando la lista muestra precios. Siempre en USD. */
  price: { currency: "USD"; finalUsd: number; beforeDiscountUsd: number; discountPercent: number } | null;
}

export interface PublicShareListOptions {
  showSku: boolean;
  showStock: boolean;
  hidePrices: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function toPublicShareListItem(item: ShareListSourceItem, opts: PublicShareListOptions): PublicShareListItem {
  const p = item.pricing;
  return {
    id: item.id,
    name: item.name,
    sku: opts.showSku ? item.sku : null,
    shortDescription: item.shortDescription,
    brandName: item.brandName,
    categoryName: item.categoryName,
    imageUrl: item.imageUrl,
    stock: opts.showStock ? { status: item.stockStatus, quantity: item.stockQuantity } : null,
    price:
      !opts.hidePrices && p
        ? {
            currency: "USD",
            finalUsd: round2(Number(p.finalPriceUsd)),
            beforeDiscountUsd: round2(Number(p.priceBeforeDiscountUsd)),
            discountPercent: Number(p.discountPercent) || 0,
          }
        : null,
  };
}

export function toPublicShareListItems(items: ShareListSourceItem[], opts: PublicShareListOptions): PublicShareListItem[] {
  return items.map((i) => toPublicShareListItem(i, opts));
}
