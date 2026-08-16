/** Títulos de Google/Serper no sirven como pie de foto en la COT. */

export function isSearchResultCaption(caption?: string | null): boolean {
  const value = (caption || "").trim();
  if (!value) return true;
  if (/^https?:\/\//i.test(value)) return true;
  if (value.includes(" | ")) return true;
  if (/\b(official site|official website|datasheet|amazon|mercado\s?libre|shop now|buy now)\b/i.test(value)) {
    return true;
  }
  return false;
}

export function sanitizeQuoteImageCaption(caption?: string | null): string {
  const value = (caption || "").trim();
  if (!value || isSearchResultCaption(value)) return "";
  return value;
}

export function displayImageCaption(caption?: string | null, fallback = ""): string | null {
  const cleaned = sanitizeQuoteImageCaption(caption);
  if (cleaned) return cleaned;
  const fallbackClean = fallback.trim();
  return fallbackClean || null;
}
