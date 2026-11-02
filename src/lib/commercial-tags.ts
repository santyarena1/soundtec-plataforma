/**
 * Etiqueta comercial de un producto: el cartel que el cliente ve sobre la foto
 * (lista, tarjetas y ficha). Se elige por producto en el panel; si no hay una
 * elegida, se muestra la que surge sola (oferta por descuento, discontinuado).
 * Liquidaciones y promociones se suman acá cuando existan esos módulos.
 */

export const COMMERCIAL_TAGS = [
  { key: "A_PEDIDO", label: "A pedido", hint: "Se trae a pedido: puede demorar o no reponerse.", className: "bg-[#1e3553] text-white" },
  { key: "LIQUIDACION", label: "Liquidación", hint: "Precio de liquidación hasta agotar stock.", className: "bg-[#b4232c] text-white" },
  { key: "ULTIMAS_UNIDADES", label: "Últimas unidades", hint: "Quedan pocas y no se reponen.", className: "bg-[#8a5a00] text-white" },
  { key: "NOVEDAD", label: "Novedad", hint: "Producto nuevo en el catálogo.", className: "bg-[#0f766e] text-white" },
] as const;

export type CommercialTagKey = (typeof COMMERCIAL_TAGS)[number]["key"];

export function isCommercialTag(value: unknown): value is CommercialTagKey {
  return COMMERCIAL_TAGS.some((tag) => tag.key === value);
}

export interface CommercialTagView {
  label: string;
  className: string;
  hint?: string;
}

/** Qué cartel mostrar: el elegido en el panel manda; si no, oferta o discontinuado. */
export function commercialTagFor(product: {
  commercialTag?: string | null;
  isDiscontinued?: boolean;
  discountPercent?: number | null;
  priceOnRequest?: boolean;
}): CommercialTagView | null {
  const chosen = COMMERCIAL_TAGS.find((tag) => tag.key === product.commercialTag);
  if (chosen) return { label: chosen.label, className: chosen.className, hint: chosen.hint };
  if (product.discountPercent && product.discountPercent > 0 && !product.priceOnRequest) {
    return { label: `Oferta −${Math.round(product.discountPercent)}%`, className: "bg-[#b4232c] text-white" };
  }
  if (product.isDiscontinued) return { label: "Últimas unidades", className: "bg-[#8a5a00] text-white" };
  return null;
}
