/**
 * En Soundtec el nombre de un producto es su código: el modelo que manda el
 * portal Sonance (ej. "DSP 2-150 MKIII") o el SKU de SoundTube (ej.
 * "CM31-EZ-BK"). El título descriptivo del proveedor queda en originalName.
 * Crestron no pasa por acá: su sync ya guarda el modelo como nombre.
 */

export type CodeNameSource = "sonance" | "soundtube";

/** Marcas que entran por el portal Sonance (ver services/sync/brand.ts). */
export const SONANCE_PORTAL_BRANDS = [
  "SONANCE",
  "BLAZE BY SONANCE",
  "JAMES",
  "IPORT",
  "TRUFIG",
] as const;

export function isSonancePortalBrand(brandName: string | null | undefined): boolean {
  const upper = brandName?.trim().toUpperCase();
  return !!upper && (SONANCE_PORTAL_BRANDS as readonly string[]).includes(upper);
}

/** Devuelve el nombre-código o null si la fuente no trae el dato (no se inventa). */
export function codeNameFor(input: {
  source: CodeNameSource;
  modelNumber?: string | null;
  supplierSku?: string | null;
}): string | null {
  const raw = input.source === "sonance" ? input.modelNumber : input.supplierSku;
  const value = raw?.trim();
  return value ? value : null;
}
