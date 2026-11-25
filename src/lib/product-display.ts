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
/**
 * Código para mostrarle al cliente (listas compartidas, exportaciones): el del
 * fabricante. El Código Tango (internalSku) es solo para el equipo de Soundtec.
 */
export function customerProductCode(p: { modelNumber?: string | null; manufacturerItem?: string | null; supplierSku?: string | null }): string | null {
  return [p.modelNumber, p.manufacturerItem, p.supplierSku].map((v) => v?.trim()).find((v) => !!v) ?? null;
}

export function tangoCode(internalSku: string | null | undefined): string | null {
  const value = clean(internalSku);
  return value && !UUID_LIKE.test(value) ? value : null;
}

/**
 * Cartel «Configurable»: solo si el producto tiene un configurador real
 * (opciones cargadas). El flag `isCustomizable` lo prende también el import
 * de Sonance o el panel al vincular accesorios, así que solo no alcanza: con
 * el flag y sin opciones la ficha no tiene nada para configurar.
 */
export function hasConfigurator(p: { isCustomizable: boolean; optionCount: number }): boolean {
  return p.isCustomizable && p.optionCount > 0;
}
