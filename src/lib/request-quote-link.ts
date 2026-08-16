export type QuoteMessageAttachment = {
  kind: "quote";
  quoteId: string;
  number: string;
};

export function parseQuoteAttachments(raw: unknown): QuoteMessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (row.kind !== "quote") return [];
    const quoteId = typeof row.quoteId === "string" ? row.quoteId : "";
    const number = typeof row.number === "string" ? row.number : "";
    if (!quoteId || !number) return [];
    return [{ kind: "quote" as const, quoteId, number }];
  });
}

export function requestShortId(requestId: string) {
  return requestId.slice(-6).toUpperCase();
}
