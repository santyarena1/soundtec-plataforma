export type QuoteMessageAttachment = {
  kind: "quote-pdf";
  quoteId: string;
  number: string;
  pdfUrl: string;
};

export function parseQuoteAttachments(raw: unknown): QuoteMessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const quoteId = typeof row.quoteId === "string" ? row.quoteId : "";
    const number = typeof row.number === "string" ? row.number : "";
    if (!quoteId || !number) return [];
    if (row.kind === "quote-pdf" && typeof row.pdfUrl === "string" && row.pdfUrl) {
      return [{ kind: "quote-pdf" as const, quoteId, number, pdfUrl: row.pdfUrl }];
    }
    // Adjuntos viejos que apuntaban al documento HTML: el cliente solo baja el PDF.
    if (row.kind === "quote") {
      return [{ kind: "quote-pdf" as const, quoteId, number, pdfUrl: `/api/quotes/${quoteId}/pdf` }];
    }
    return [];
  });
}

export function requestShortId(requestId: string) {
  return requestId.slice(-6).toUpperCase();
}

export function clientQuotePdfHref(requestId: string, att: QuoteMessageAttachment) {
  if (att.pdfUrl.startsWith("http")) return att.pdfUrl;
  return `/api/portal/requests/${requestId}/quote-pdf/${att.quoteId}`;
}
