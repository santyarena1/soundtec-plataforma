export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, ""));
}

export function buildProductSearchKey(p: {
  internalSku?: string | null;
  supplierSku?: string | null;
  normalizedName?: string | null;
  originalName?: string | null;
  modelNumber?: string | null;
  manufacturerItem?: string | null;
  brandName?: string | null;
}): string {
  return normalizeForSearch([
    p.internalSku,
    p.supplierSku,
    p.normalizedName,
    p.originalName,
    p.modelNumber,
    p.manufacturerItem,
    p.brandName,
  ].filter((value): value is string => typeof value === "string" && value.length > 0).join(" "));
}
