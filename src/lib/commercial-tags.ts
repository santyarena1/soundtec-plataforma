/**
 * Etiqueta comercial de un producto: el cartel que el cliente ve sobre la foto
 * (lista, tarjetas y ficha). Se elige por producto en el panel; si no hay una
 * elegida, la única automática es el descuento («Descuento 20%»).
 *
 * «Últimas unidades» habla del stock PROPIO de Soundtec: solo sale cuando el
 * equipo la elige a mano en el producto. Nunca se dispara por datos de los
 * portales o proveedores (stock en origen, «discontinuado» del fabricante).
 */

export const COMMERCIAL_TAGS = [
  { key: "A_PEDIDO", label: "A pedido", hint: "Se trae a pedido: puede demorar o no reponerse.", className: "bg-[#1e3553] text-white" },
  { key: "LIQUIDACION", label: "Liquidación", hint: "Precio de liquidación hasta agotar stock.", className: "bg-[#b4232c] text-white" },
  { key: "ULTIMAS_UNIDADES", label: "Últimas unidades", hint: "Quedan pocas en el stock de Soundtec y no se reponen.", className: "bg-[#8a5a00] text-white" },
  { key: "NOVEDAD", label: "Novedad", hint: "Producto nuevo en el catálogo.", className: "bg-[#0f766e] text-white" },
] as const;

export type CommercialTagKey = (typeof COMMERCIAL_TAGS)[number]["key"];

export function isCommercialTag(value: unknown): value is CommercialTagKey {
  return COMMERCIAL_TAGS.some((tag) => tag.key === value);
}

export interface CommercialTagView {
  /** `chosen`: la eligió el equipo en el panel. `discount`: sale sola por el descuento del precio. */
  kind: "chosen" | "discount";
  label: string;
  className: string;
  hint?: string;
}

/** Rótulo del cartel de descuento: «Descuento 20%» (sin decimales sueltos). */
export function discountTagLabel(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  return `Descuento ${rounded.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

/** Qué cartel mostrar: el elegido en el panel manda; si no, el descuento. Nada más es automático. */
export function commercialTagFor(product: {
  commercialTag?: string | null;
  discountPercent?: number | null;
  priceOnRequest?: boolean;
}): CommercialTagView | null {
  const chosen = COMMERCIAL_TAGS.find((tag) => tag.key === product.commercialTag);
  if (chosen) return { kind: "chosen", label: chosen.label, className: chosen.className, hint: chosen.hint };
  if (product.discountPercent && product.discountPercent > 0 && !product.priceOnRequest) {
    return { kind: "discount", label: discountTagLabel(product.discountPercent), className: "bg-[#b4232c] text-white" };
  }
  return null;
}
