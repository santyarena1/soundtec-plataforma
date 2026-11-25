/**
 * Búsqueda y paginado de la tabla de reglas (Márgenes / Descuentos). Con ~600
 * reglas la tabla entera pesaba casi 2 MB de HTML y tardaba en dibujarse: se
 * muestran de a tandas y se puede buscar por marca, rubro, cliente, nombre o valor.
 */

export const RULES_PAGE_SIZE = 50;

/** Minúsculas y sin acentos: «Márgen» encuentra «margen». */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Todas las palabras de la búsqueda tienen que aparecer (en cualquier orden). */
export function matchesSearch(haystack: string, query: string): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = normalizeSearch(haystack);
  return words.every((word) => text.includes(word));
}

/**
 * Filtra y corta: lo que se muestra, cuántas coinciden y si quedan más. Las
 * `pinned` (con cambio pendiente, la que se edita, las recién guardadas) se
 * muestran siempre aunque caigan más allá del corte, en su lugar de la lista.
 */
export function pageEntries<T>(
  entries: readonly T[],
  textOf: (entry: T) => string,
  query: string,
  limit: number,
  pinned: (entry: T) => boolean = () => false
): { shown: T[]; matched: number; hasMore: boolean } {
  const matched = query.trim() ? entries.filter((entry) => matchesSearch(textOf(entry), query)) : [...entries];
  const shown = matched.filter((entry, index) => index < limit || pinned(entry));
  return { shown, matched: matched.length, hasMore: shown.length < matched.length };
}
