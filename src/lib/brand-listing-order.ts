/**
 * Orden de los productos al entrar a una marca (vista cliente):
 *
 *  1. Los destacados (estrella) primero.
 *  2. Después, agrupados por rubro: primero los rubros que el equipo eligió
 *     para esa marca (Admin → Marcas → Orden de rubros), en ese orden; el
 *     rubro de un producto es el elegido más cercano subiendo por el árbol
 *     (elegir «Sonido» abarca todos sus subrubros, y un subrubro elegido
 *     antes le gana a su padre).
 *  3. Los rubros no elegidos van después, por ruta alfabética; los productos
 *     sin rubro, al final.
 *  4. Dentro de cada grupo manda el orden de siempre (`fallback`).
 *
 * Al quitar la estrella el producto vuelve solo a su lugar por rubro: no se
 * guarda ninguna posición.
 */

export interface BrandListingItem {
  id: string;
  isFeatured: boolean;
  categoryId: string | null;
}

export interface BrandListingCategory {
  id: string;
  parentId: string | null;
  /** Clave para agrupar y ordenar alfabéticamente (ruta completa del rubro). */
  sortKey: string;
}

export function brandListingComparator<T extends BrandListingItem>(options: {
  categoryOrder: readonly string[];
  categories: readonly BrandListingCategory[];
  fallback: (a: T, b: T) => number;
}): (a: T, b: T) => number {
  const position = new Map(options.categoryOrder.map((id, index) => [id, index]));
  const byId = new Map(options.categories.map((category) => [category.id, category]));
  const unlisted = options.categoryOrder.length;
  const rankCache = new Map<string, number>();

  // Rubro elegido más cercano (el propio o un ancestro); sin elegir = después de todos.
  const rankOf = (categoryId: string | null): number => {
    if (!categoryId) return unlisted + 1;
    const cached = rankCache.get(categoryId);
    if (cached != null) return cached;
    let rank = unlisted;
    const seen = new Set<string>();
    let current: string | null = categoryId;
    while (current && !seen.has(current)) {
      seen.add(current);
      const at = position.get(current);
      if (at != null) {
        rank = at;
        break;
      }
      current = byId.get(current)?.parentId ?? null;
    }
    rankCache.set(categoryId, rank);
    return rank;
  };
  const keyOf = (categoryId: string | null) => (categoryId ? byId.get(categoryId)?.sortKey ?? "" : "");

  return (a, b) =>
    Number(b.isFeatured) - Number(a.isFeatured) ||
    rankOf(a.categoryId) - rankOf(b.categoryId) ||
    keyOf(a.categoryId).localeCompare(keyOf(b.categoryId), "es") ||
    options.fallback(a, b);
}

/** Ruta legible de cada rubro, para agrupar («SONIDO > BAFLES PASIVOS»). */
export function categorySortKeys(
  rows: ReadonlyArray<{ id: string; parentId: string | null; name: string; tangoPath?: string | null }>
): BrandListingCategory[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathOf = (id: string): string => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let current = byId.get(id);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      parts.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return parts.join(" > ").toUpperCase();
  };
  return rows.map((row) => ({ id: row.id, parentId: row.parentId, sortKey: row.tangoPath?.toUpperCase() || pathOf(row.id) }));
}
