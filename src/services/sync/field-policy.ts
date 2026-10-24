/**
 * Qué puede pisar una sincronización en un producto que ya existe.
 *
 * Regla acordada (2026-10-24): lo único que se actualiza siempre es el precio
 * (costo, descuento, oferta) y la disponibilidad, que cambian todos los días.
 * Todo lo demás —nombre, descripciones, rubro, subrubro, familia, tipo,
 * medidas, SEO…— se completa solo si está vacío: lo que alguien cargó o
 * corrigió a mano no se pierde en la próxima corrida.
 */

/** Campos que la sincronización actualiza siempre. */
export const SYNC_ALWAYS_FIELDS = new Set<string>([
  "baseCostUsd",
  "currency",
  "discountPercent",
  "salePriceUsd",
  "salePriceStartsAt",
  "salePriceEndsAt",
  "salePriceLabel",
  "requiresQuote",
  "stockStatus",
  "stockQuantity",
  "availabilityType",
  "availabilityMessage",
  "isDiscontinued",
  // Datos técnicos del propio sync (no se ven ni se editan en la ficha).
  "sourceMetadata",
  "sourceCategoryPath",
  "vendorPublishedAt",
]);

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object" && !(value instanceof Date)) {
    // Prisma.Decimal y similares no son «vacíos».
    if (typeof (value as { toNumber?: unknown }).toNumber === "function") return false;
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/**
 * Devuelve una copia de `incoming` sin los campos que no se pueden pisar:
 * quedan los de SYNC_ALWAYS_FIELDS y los que en el producto están vacíos.
 */
export function applySyncFieldPolicy<T extends Record<string, unknown>>(existing: Record<string, unknown>, incoming: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [field, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (SYNC_ALWAYS_FIELDS.has(field) || isEmptyValue(existing[field])) {
      (out as Record<string, unknown>)[field] = value;
    }
  }
  return out;
}
