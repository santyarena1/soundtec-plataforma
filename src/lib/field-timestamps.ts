export const SCALAR_PRODUCT_FIELDS: string[] = [
  "internalSku", "supplierSku", "normalizedName", "originalName", "brandId",
  "distributorId", "categoryId", "familyId", "familia", "tipo", "kind",
  "baseCostUsd", "currency", "discountPercent", "stockStatus", "stockQuantity",
  "availabilityType", "availabilityMessage", "shortDescription", "longDescription",
  "htmlContent", "modelNumber", "manufacturerItem", "metaTitle", "metaDescription",
  "metaKeywords", "salePriceUsd", "salePriceLabel", "requiresQuote", "weight",
  "volume", "widthCm", "heightCm", "depthCm", "urlSlug", "vendorProductUrl",
  "videoUrl", "coo", "tariffPosition", "tariffDutyPercent", "aecPercent",
  "tePercent", "coefNac", "coefVta", "ivaPercent", "impIntPercent",
  "coefVtaFob", "isActive",
];

function normalized(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number(value);
  if (typeof value === "object" && "toNumber" in value) {
    const toNumber = (value as { toNumber?: unknown }).toNumber;
    if (typeof toNumber === "function") return Number(toNumber.call(value));
  }
  return value;
}

export function changedScalarFields(
  current: Record<string, unknown>,
  nextData: Record<string, unknown>
): string[] {
  return SCALAR_PRODUCT_FIELDS.filter((field) => {
    if (!(field in nextData) || nextData[field] === undefined) return false;
    return normalized(current[field]) !== normalized(nextData[field]);
  });
}

function timestampObject(existing: unknown): Record<string, string> {
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) return {};
  return Object.fromEntries(
    Object.entries(existing).filter((entry): entry is [string, string] => (
      typeof entry[1] === "string"
    ))
  );
}

export function mergeFieldTimestamps(
  existing: unknown,
  changed: string[],
  nowIso: string
): Record<string, string> {
  const merged = timestampObject(existing);
  if (changed.length === 0) return merged;
  for (const field of changed) merged[field] = nowIso;
  return merged;
}
