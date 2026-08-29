export type QuoteAiSuggestion = {
  key: string;
  productId: string | null;
  name: string;
  quantity: number;
  rationale: string;
  kind: "PRODUCT" | "SERVICE";
  serviceType?: string;
};

type SpacesBag = {
  aiSuggestions?: unknown;
  [key: string]: unknown;
};

export function readAiSuggestions(spaces: unknown): QuoteAiSuggestion[] {
  if (!spaces || typeof spaces !== "object" || Array.isArray(spaces)) return [];
  const raw = (spaces as SpacesBag).aiSuggestions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index): QuoteAiSuggestion | null => {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!name) return null;
      const qty = Number(o.quantity);
      return {
        key: typeof o.key === "string" && o.key ? o.key : `sug-${index}-${name}`,
        productId: typeof o.productId === "string" && o.productId ? o.productId : null,
        name,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        rationale: typeof o.rationale === "string" ? o.rationale : "",
        kind: o.kind === "SERVICE" ? "SERVICE" : "PRODUCT",
        serviceType: typeof o.serviceType === "string" ? o.serviceType : undefined,
      };
    })
    .filter((row): row is QuoteAiSuggestion => Boolean(row));
}

export function spacesWithSuggestions(prev: unknown, suggestions: QuoteAiSuggestion[]): SpacesBag {
  const base =
    prev && typeof prev === "object" && !Array.isArray(prev) ? { ...(prev as SpacesBag) } : {};
  return { ...base, aiSuggestions: suggestions };
}

export function spacesWithoutSuggestion(prev: unknown, key: string): SpacesBag {
  return spacesWithSuggestions(
    prev,
    readAiSuggestions(prev).filter((row) => row.key !== key)
  );
}
