/** Etiquetas de oferta copiadas del portal del fabricante. No son descuentos de Soundtec. */

export function isManufacturerPromoLabel(text?: string | null): boolean {
  const value = (text || "").trim();
  if (!value) return false;
  return /\boff\b|\bon\s*sale\b|\bsale\b|-\s*\d+([.,]\d+)?\s*%|\d+([.,]\d+)?\s*%\s*off/i.test(value);
}

export function badgeLabel(badge: unknown): string {
  if (typeof badge === "string") return badge.trim();
  if (badge && typeof badge === "object" && "name" in badge && typeof (badge as { name?: unknown }).name === "string") {
    return String((badge as { name: string }).name).trim();
  }
  return "";
}

export function filterCustomerBadges(badges: unknown): unknown[] {
  if (!Array.isArray(badges)) return [];
  return badges.filter((badge) => {
    const label = badgeLabel(badge);
    return label.length > 0 && !isManufacturerPromoLabel(label);
  });
}
