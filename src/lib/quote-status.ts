/**
 * Cómo se llama cada estado de una cotización en pantalla. «Emitida» confundía
 * (no es una factura): es que ya se generó el PDF para el cliente.
 */
export const QUOTE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  READY: "Lista",
  ISSUED: "PDF generado",
  SUPERSEDED: "Reemplazada",
  ARCHIVED: "Archivada",
};

export function quoteStatusLabel(status: string, pdfOutdated?: boolean | null): string {
  if (status === "ISSUED" && pdfOutdated) return "PDF desactualizado";
  return QUOTE_STATUS_LABEL[status] ?? status;
}

/** La rápida vieja guardaba «Cotización rápida 27/10/2026» como referencia: eso no es un nombre de proyecto. */
const AUTO_QUICK_REFERENCE = /^cotizaci[oó]n r[aá]pida(\s+\d{1,2}\/\d{1,2}\/\d{2,4})?$/i;

/** Referencia que escribió el usuario, o null (las automáticas viejas cuentan como vacías). */
export function cleanQuoteReference(reference: string | null | undefined): string | null {
  const value = (reference ?? "").trim();
  return value && !AUTO_QUICK_REFERENCE.test(value) ? value : null;
}

/** Lo que va en «Ref.» del PDF: la referencia, o el número de la cotización si no hay. */
export function quoteReferenceOrNumber(reference: string | null | undefined, number: string): string {
  return cleanQuoteReference(reference) ?? number;
}
