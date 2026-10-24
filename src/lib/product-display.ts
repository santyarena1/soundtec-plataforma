/**
 * Cómo se nombra un producto en TODAS las pantallas (catálogo del cliente,
 * catálogo público, panel, fichas y cotización rápida):
 *
 * - Título: el modelo (campo MODELO / normalizedName), ej. «PPX8», «SM400I-WH».
 * - Debajo: la descripción en español (o, si no hay, la del fabricante en inglés),
 *   sin repetir el modelo.
 * - Arriba, chico: la marca. El código no se repite.
 *
 * Antes cada pantalla elegía distinto (el portal ponía la descripción inglesa
 * como título y el código arriba; el panel, el código como título).
 */

export type ProductDisplayInput = {
  normalizedName: string;
  originalName?: string | null;
  shortDescription?: string | null;
  modelNumber?: string | null;
};

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

export function productTitle(p: ProductDisplayInput): string {
  return clean(p.normalizedName) || clean(p.modelNumber) || clean(p.originalName) || "Producto sin nombre";
}

/** Descripción debajo del título; null si no hay nada distinto del modelo. */
export function productSubtitle(p: ProductDisplayInput): string | null {
  const title = productTitle(p).toLowerCase();
  for (const candidate of [p.shortDescription, p.originalName]) {
    const text = clean(candidate);
    if (text && text.toLowerCase() !== title) return text;
  }
  return null;
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Código Tango para mostrar (solo en el panel); null si no hay o es un id interno ilegible. */
export function tangoCode(internalSku: string | null | undefined): string | null {
  const value = clean(internalSku);
  return value && !UUID_LIKE.test(value) ? value : null;
}
