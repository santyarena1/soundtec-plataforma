/**
 * Stock para clientes y visitantes (portal, catálogo público, listas
 * compartidas). Apagado: el cliente no ve leyendas ni cantidades de stock,
 * en su lugar ve «Consultá stock»; no hay filtros de stock y el catálogo
 * incluye los productos sin stock. Para volver a mostrarlo, pasar a `true`.
 *
 * El único stock que tiene la plataforma es el que informa el proveedor
 * (stock en origen): el equipo de Soundtec lo ve rotulado así para no
 * confundirlo con la disponibilidad que se le confirma al cliente.
 */
export const SHOW_STOCK_TO_CUSTOMERS = false;

/** Lo que ve el cliente en lugar del stock. */
export const CUSTOMER_STOCK_LABEL = "Consultá stock";

/** Rótulo del stock que informa el proveedor (solo equipo Soundtec). */
export const ORIGIN_STOCK_LABEL = "Stock en origen (proveedor)";

export type OriginStockTone = "success" | "warning" | "destructive" | "accent" | "muted";

/** Texto corto del stock en origen («En stock · 640», «Sin stock», «Sin dato»). */
export function originStockText(status: string, qty: number | null): { text: string; tone: OriginStockTone } {
  const withQty = (label: string) => (qty != null ? `${label} · ${qty.toLocaleString("es-AR")}` : label);
  if (status === "IN_STOCK") return { text: withQty("En stock"), tone: "success" };
  if (status === "LOW_STOCK") return { text: withQty("Stock bajo"), tone: "warning" };
  if (status === "OUT_OF_STOCK") return { text: "Sin stock", tone: "destructive" };
  if (status === "ON_REQUEST") return { text: "Bajo pedido", tone: "accent" };
  return { text: "Sin dato", tone: "muted" };
}
