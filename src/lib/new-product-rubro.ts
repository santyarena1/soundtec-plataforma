/**
 * Rubro de los productos NUEVOS que entran por importadores y sincronizaciones
 * (puro, con tests). Cada importador arma la «ruta del proveedor» con lo que
 * realmente trae; con esa ruta se busca la equivalencia en Rubros ›
 * Equivalencias. Si no hay, el producto entra en «Sin categorizar». Nunca se
 * crean categorías ni se elige un rubro por parecido de palabras, y a los
 * productos que ya existen no se les cambia el rubro.
 */

/** Pestaña de la bandeja «Sin rubro» en Rubros. */
export const SIN_RUBRO_HREF = "/admin/categories?tab=sin-rubro";
/** Pestaña de Equivalencias en Rubros. */
export const EQUIVALENCIAS_HREF = "/admin/categories?tab=equivalencias";

/** Texto para las pantallas de importación: de dónde sale el rubro. */
export const RUBRO_FROM_EQUIVALENCES_HELP =
  "El rubro de los productos nuevos sale de la tabla de Equivalencias (Rubros › Equivalencias). Si la categoría del proveedor no tiene equivalencia, el producto entra en Sin categorizar. A los productos que ya existen no se les cambia el rubro.";

/**
 * Une las partes de una ruta del proveedor con « > »: saca vacíos y repetidos
 * seguidos («Accessories > Accessories» → «Accessories»). undefined si no queda nada.
 */
export function joinProviderPath(...parts: Array<string | null | undefined>): string | undefined {
  const clean: string[] = [];
  for (const part of parts) {
    const text = (part ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (clean.length && clean[clean.length - 1].toLowerCase() === text.toLowerCase()) continue;
    clean.push(text);
  }
  return clean.length ? clean.join(" > ") : undefined;
}

/** Sonance (portal): «Product Category > Product Sub Category». */
export function sonanceProviderPath(category: string | null | undefined, subcategory: string | null | undefined): string | undefined {
  return joinProviderPath(category, subcategory);
}

/** Lista Excel de SoundTube: «CATEGORIA > SEGMENTO > FAMILIA > TIPO» (las columnas que vengan). */
export function soundTubeListPath(row: { categoria?: string | null; segmento?: string | null; familia?: string | null; tipo?: string | null }): string | undefined {
  return joinProviderPath(row.categoria, row.segmento, row.familia, row.tipo);
}

/** Fuente de equivalencia de cada conector de sincronización. */
export function equivalenceSourceForSync(source: string): string {
  switch (source) {
    case "CRESTRON":
    case "CRESTRON_WEB":
      return "crestron";
    case "SONANCE":
      return "sonance";
    case "SOUNDTUBE":
      return "soundtube";
    case "HALL_RESEARCH_WEB":
      return "hall";
    case "EXCEL":
      return "excel";
    default:
      return "sync";
  }
}

/** «12 productos nuevos quedaron en Sin categorizar: …» o null si no hay ninguno. */
export function uncategorizedNewNotice(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const n = Math.trunc(count);
  return n === 1
    ? "1 producto nuevo quedó en Sin categorizar: ubicalo en Rubros › Sin rubro."
    : `${n} productos nuevos quedaron en Sin categorizar: ubicalos en Rubros › Sin rubro.`;
}
