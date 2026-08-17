export const BRAND_KEYWORDS: Array<{ test: RegExp; brand: string }> = [
  { test: /blaze/i, brand: "BLAZE BY SONANCE" },
  { test: /trufig/i, brand: "TRUFIG" },
  { test: /apparel/i, brand: "APPAREL" },
  { test: /iport/i, brand: "IPORT" },
  { test: /james/i, brand: "JAMES" },
];

export function inferBrandFromKeywords(
  textFields: Array<string | null | undefined>
): string | null {
  const haystack = textFields.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return null;
  for (const { test, brand } of BRAND_KEYWORDS) {
    if (test.test(haystack)) return brand;
  }
  return null;
}

export function canonicalizeSonanceBrand(
  raw: string | null | undefined
): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;

  const inferred = inferBrandFromKeywords([trimmed]);
  if (inferred) return inferred;

  if (/^pn[\s_-]+/i.test(trimmed)) {
    const withoutPrefix = trimmed.replace(/^pn[\s_-]+/i, "").trim();
    return withoutPrefix ? withoutPrefix.toUpperCase() : undefined;
  }
  return trimmed;
}
