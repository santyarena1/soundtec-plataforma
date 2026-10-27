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
