/**
 * Totales de una cotización y cómo se muestran los impuestos.
 *
 * Vive aparte porque el documento se arma dos veces: el PDF se genera como
 * string HTML (`quote-document-html.ts`) y la vista previa como React
 * (`components/quotes/quote-document.tsx`). Si el cálculo estuviera en cada
 * uno, tarde o temprano dirían cosas distintas sobre la misma cotización.
 */

/**
 * Qué hacer con el IVA en el documento. No todo lo que se cotiza lleva
 * impuesto, así que es una decisión por cotización y no una regla fija.
 */
export type QuoteTaxMode =
  /** Solo una leyenda aclaratoria; no se muestra ningún monto. Es el comportamiento histórico. */
  | "NOTE"
  /** No se menciona el impuesto en ningún lado. */
  | "NONE"
  /** Se discrimina el IVA y se muestra el total final. */
  | "ADDED";

export const TAX_MODES: Array<{ key: QuoteTaxMode; label: string; hint: string }> = [
  { key: "NOTE", label: "Leyenda «+ IVA»", hint: "Los precios van sin impuesto y el documento lo aclara." },
  { key: "ADDED", label: "Discriminar IVA", hint: "Se agrega el IVA calculado y el total final." },
  { key: "NONE", label: "Sin impuestos", hint: "No se menciona el impuesto en ningún lado." },
];

export function isTaxMode(value: unknown): value is QuoteTaxMode {
  return value === "NOTE" || value === "NONE" || value === "ADDED";
}

export interface TaxableLine {
  lineTotalUsd: unknown;
  ivaRate?: unknown;
  optional?: boolean;
  excluded?: boolean;
}

export interface QuoteTotals {
  /** Suma de las líneas que entran en el precio (sin opcionales ni excluidas). */
  net: number;
  /** Monto de IVA. Cero si el modo no lo discrimina. */
  tax: number;
  /** Neto más impuesto. Igual al neto cuando no se discrimina. */
  total: number;
  /** Alícuota única cuando todas las líneas comparten la misma; null si conviven varias. */
  singleRate: number | null;
  mode: QuoteTaxMode;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Líneas que suman al precio: las opcionales se cotizan aparte y las excluidas no van. */
export function payableLines<T extends TaxableLine>(items: T[]): T[] {
  return items.filter((item) => !item.excluded && !item.optional);
}

export function computeQuoteTotals(items: TaxableLine[], mode: QuoteTaxMode): QuoteTotals {
  const payable = payableLines(items);
  const net = payable.reduce((sum, item) => sum + toNumber(item.lineTotalUsd), 0);

  const rates = new Set(payable.map((item) => toNumber(item.ivaRate)));
  const singleRate = rates.size === 1 ? [...rates][0] : null;

  if (mode !== "ADDED") {
    return { net, tax: 0, total: net, singleRate, mode };
  }

  const tax = payable.reduce(
    (sum, item) => sum + toNumber(item.lineTotalUsd) * (toNumber(item.ivaRate) / 100),
    0
  );
  return { net, tax, total: net + tax, singleRate, mode };
}

/** Texto al pie de la tabla. Null cuando el documento no menciona impuestos. */
export function taxNote(totals: QuoteTotals, currencyLabel = "dólares estadounidenses"): string | null {
  if (totals.mode === "NONE") return `Precios en ${currencyLabel}.`;
  if (totals.mode === "ADDED") {
    return `Precios en ${currencyLabel}, IVA discriminado.`;
  }
  return `Precios en ${currencyLabel}, IVA no incluido.`;
}

/** Etiqueta de la fila de impuesto: "IVA 21%" cuando hay una sola alícuota. */
export function taxLabel(totals: QuoteTotals): string {
  return totals.singleRate !== null ? `IVA ${formatRate(totals.singleRate)}%` : "IVA";
}

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(/\.?0+$/, "");
}
