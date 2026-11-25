/**
 * Orden de los productos al entrar a una marca (vista cliente, «Más relevantes»
 * y sin búsqueda):
 *
 *  1. Los destacados (estrella) primero, en una sección «Destacados».
 *  2. Después, agrupados por rubro del árbol de Tango. Primero los rubros que el
 *     equipo eligió para esa marca (Admin → Marcas → Orden de rubros), en ese
 *     orden. Elegir un rubro abarca todo lo que cuelga de él («Bafles pasivos»
 *     trae colgantes, de embutir, exterior…) y un subrubro elegido antes le gana
 *     a su padre.
 *  3. Los rubros no elegidos van después, por ruta alfabética. Los productos sin
 *     rubro de Tango (categoría vieja, «Sin categorizar» o ninguna), al final.
 *  4. Dentro de cada grupo manda el orden de siempre (`fallback`).
 *
 * Encabezados: cada grupo se titula con su rubro de nivel 3 («Sonido › Bafles
 * pasivos › Bafles de embutir» → «Bafles de embutir»), o con el rubro elegido si
 * es más fino que eso («Techo»). Es también «el rubro del producto» para
 * «Destacar rubro en su marca».
 *
 * Al quitar la estrella el producto vuelve solo a su lugar por rubro: no se
 * guarda ninguna posición. Este archivo no toca la base: reglas puras, con tests.
 */

/** Nivel del árbol que titula los grupos (1 = rubro, 2 = subrubro, 3 = el siguiente). */
export const LISTING_GROUP_DEPTH = 3;

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
  /** Nombre para el encabezado («Bafles de embutir»). */
  name?: string;
  /** false = categoría vieja (fuera del árbol de Tango) o «Sin categorizar». */
  isTango?: boolean;
  /** false = rubro desactivado. */
  isActive?: boolean;
}

export interface ListingPlacement {
  /** Posición del rubro elegido que lo abarca; sin elegir = después de todos. */
  rank: number;
  /** Rubro que titula su grupo (null = sin rubro de Tango). */
  groupId: string | null;
  /** Rubro elegido que lo abarca (el propio o un ancestro), o null. */
  chosenId: string | null;
  groupKey: string;
  leafKey: string;
}

export interface ListingSection {
  /** «featured», el id del rubro o «other». */
  key: string;
  kind: "featured" | "rubro" | "other";
  title: string;
  /** Camino del rubro sin el último tramo («Sonido › Bafles pasivos»). */
  context: string | null;
  /** Lugar en el orden elegido (0 = primero) o null si sale por nombre. */
  chosenPosition: number | null;
  /** Índice del primer producto de la sección en la lista ordenada. */
  startIndex: number;
}

const LAST = "￿";

export function createBrandListingIndex(options: { categoryOrder: readonly string[]; categories: readonly BrandListingCategory[] }) {
  const position = new Map<string, number>();
  options.categoryOrder.forEach((id, index) => {
    if (!position.has(id)) position.set(id, index);
  });
  const byId = new Map(options.categories.map((category) => [category.id, category]));
  const unlisted = options.categoryOrder.length;
  const chainCache = new Map<string, string[]>();
  const placementCache = new Map<string, ListingPlacement>();

  /** Del rubro principal al propio. */
  const chainOf = (categoryId: string): string[] => {
    const cached = chainCache.get(categoryId);
    if (cached) return cached;
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | null = categoryId;
    while (current && !seen.has(current) && byId.has(current)) {
      seen.add(current);
      chain.unshift(current);
      current = byId.get(current)?.parentId ?? null;
    }
    chainCache.set(categoryId, chain);
    return chain;
  };

  const outside: ListingPlacement = { rank: unlisted + 1, groupId: null, chosenId: null, groupKey: LAST, leafKey: "" };

  const placementOf = (categoryId: string | null): ListingPlacement => {
    if (!categoryId) return outside;
    const cached = placementCache.get(categoryId);
    if (cached) return cached;
    const node = byId.get(categoryId);
    if (!node || node.isTango === false) {
      placementCache.set(categoryId, outside);
      return outside;
    }
    const chain = chainOf(categoryId);
    let chosenDepth = -1;
    for (let depth = chain.length - 1; depth >= 0; depth--) {
      if (position.has(chain[depth])) {
        chosenDepth = depth;
        break;
      }
    }
    const levelGroup = chain[Math.min(LISTING_GROUP_DEPTH, chain.length) - 1];
    // El elegido más fino que el nivel 3 titula su propio grupo («Techo»).
    const groupId = chosenDepth >= LISTING_GROUP_DEPTH ? chain[chosenDepth] : levelGroup;
    const chosenId = chosenDepth >= 0 ? chain[chosenDepth] : null;
    const placement: ListingPlacement = {
      rank: chosenId ? position.get(chosenId)! : unlisted,
      groupId,
      chosenId,
      groupKey: byId.get(groupId)?.sortKey ?? "",
      leafKey: node.sortKey,
    };
    placementCache.set(categoryId, placement);
    return placement;
  };

  const comparator = <T extends BrandListingItem>(fallback: (a: T, b: T) => number) => {
    return (a: T, b: T): number => {
      const pa = placementOf(a.categoryId);
      const pb = placementOf(b.categoryId);
      return (
        Number(b.isFeatured) - Number(a.isFeatured) ||
        pa.rank - pb.rank ||
        pa.groupKey.localeCompare(pb.groupKey, "es") ||
        pa.leafKey.localeCompare(pb.leafKey, "es") ||
        fallback(a, b)
      );
    };
  };

  const nameOf = (id: string) => byId.get(id)?.name ?? "";
  const contextOf = (id: string) =>
    chainOf(id)
      .slice(0, -1)
      .map(nameOf)
      .filter(Boolean)
      .join(" › ") || null;

  /** Secciones (con encabezado) de una lista ya ordenada con `comparator`. */
  const sectionsOf = (ordered: readonly BrandListingItem[]): ListingSection[] => {
    const sections: ListingSection[] = [];
    let lastKey: string | null = null;
    ordered.forEach((item, index) => {
      const placement = placementOf(item.categoryId);
      const key = item.isFeatured ? "featured" : placement.groupId ?? "other";
      if (key === lastKey) return;
      lastKey = key;
      if (key === "featured") {
        sections.push({ key, kind: "featured", title: "Destacados", context: null, chosenPosition: null, startIndex: index });
      } else if (key === "other") {
        sections.push({ key, kind: "other", title: "Otros productos", context: null, chosenPosition: null, startIndex: index });
      } else {
        sections.push({
          key,
          kind: "rubro",
          title: nameOf(key) || "Rubro",
          context: contextOf(key),
          chosenPosition: placement.chosenId ? placement.rank : null,
          startIndex: index,
        });
      }
    });
    return sections;
  };

  return { placementOf, comparator, sectionsOf, chainOf, nameOf, contextOf, byId };
}

export type BrandListingIndex = ReturnType<typeof createBrandListingIndex>;

/** Comparador listo para usar (el de siempre, para quien no necesita secciones). */
export function brandListingComparator<T extends BrandListingItem>(options: {
  categoryOrder: readonly string[];
  categories: readonly BrandListingCategory[];
  fallback: (a: T, b: T) => number;
}): (a: T, b: T) => number {
  return createBrandListingIndex(options).comparator(options.fallback);
}

/** Ruta legible de cada rubro, para agrupar («SONIDO > BAFLES PASIVOS»). */
export function categorySortKeys(
  rows: ReadonlyArray<{ id: string; parentId: string | null; name: string; tangoPath?: string | null; isActive?: boolean; slug?: string | null }>
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
  return rows.map((row) => ({
    id: row.id,
    parentId: row.parentId,
    sortKey: row.tangoPath?.toUpperCase() || pathOf(row.id),
    name: row.name,
    // Sin tangoPath = categoría vieja o «Sin categorizar»: no es un rubro para el cliente.
    isTango: row.tangoPath === undefined ? undefined : Boolean(row.tangoPath),
    isActive: row.isActive,
  }));
}

// ── Orden guardado con rubros viejos ─────────────────────────────────────────

export interface ResolvedCategoryOrder {
  order: string[];
  /** Rubros viejos pasados a su rubro de Tango equivalente. */
  migrated: Array<{ from: string; fromName: string | null; to: string }>;
  /** Ids sin equivalente (rubro borrado, desactivado o viejo sin destino claro). */
  dropped: Array<{ id: string; name: string | null }>;
}

/**
 * Limpia el orden guardado: deja los rubros activos del árbol de Tango, pasa los
 * viejos a su equivalente (`legacyMap`) y descarta el resto, avisando cuál.
 */
export function resolveCategoryOrder(
  order: readonly string[],
  categories: readonly BrandListingCategory[],
  legacyMap: ReadonlyMap<string, string | null> = new Map()
): ResolvedCategoryOrder {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const usable = (id: string) => {
    const node = byId.get(id);
    return Boolean(node && node.isTango !== false && node.isActive !== false);
  };
  const out: string[] = [];
  const migrated: ResolvedCategoryOrder["migrated"] = [];
  const dropped: ResolvedCategoryOrder["dropped"] = [];
  for (const id of order) {
    if (usable(id)) {
      if (!out.includes(id)) out.push(id);
      continue;
    }
    const target = legacyMap.get(id);
    if (target && usable(target)) {
      if (!out.includes(target)) out.push(target);
      migrated.push({ from: id, fromName: byId.get(id)?.name ?? null, to: target });
      continue;
    }
    dropped.push({ id, name: byId.get(id)?.name ?? null });
  }
  return { order: out, migrated, dropped };
}

/**
 * Rubro común más fino de varios rubros (para pasar una categoría vieja a Tango:
 * donde terminaron sus productos). null si no comparten al menos `minDepth` niveles.
 */
export function commonCategoryAncestor(
  ids: readonly string[],
  categories: readonly Pick<BrandListingCategory, "id" | "parentId">[],
  minDepth = 2
): string | null {
  if (ids.length === 0) return null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const chainOf = (id: string) => {
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | null = id;
    while (current && !seen.has(current) && byId.has(current)) {
      seen.add(current);
      chain.unshift(current);
      current = byId.get(current)?.parentId ?? null;
    }
    return chain;
  };
  const chains = ids.map(chainOf).filter((c) => c.length > 0);
  if (chains.length === 0) return null;
  let depth = 0;
  while (chains.every((c) => c.length > depth && c[depth] === chains[0][depth])) depth++;
  return depth >= minDepth ? chains[0][depth - 1] : null;
}

function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/s$/, "").replace(/e$/, ""))
    .join(" ");
}

/**
 * Respaldo para una categoría vieja sin reclasificación registrada: el rubro de
 * la marca con el mismo nombre («Parlante» = «Parlantes»). Solo si hay uno.
 */
export function matchCategoryByName(name: string | null | undefined, candidates: ReadonlyArray<{ id: string; name?: string }>): string | null {
  if (!name?.trim()) return null;
  const key = nameKey(name);
  const hits = candidates.filter((c) => c.name && nameKey(c.name) === key);
  return hits.length === 1 ? hits[0].id : null;
}

// ── «Destacar rubro en su marca» ─────────────────────────────────────────────

export interface RubroHighlight {
  /** Rubro del producto tal como se agrupa en la marca (su encabezado). */
  rubroId: string;
  rubroName: string;
  rubroContext: string | null;
  /** Lugar del propio rubro en el orden (0 = primero) o null si no está. */
  position: number | null;
  /** Si no está, el rubro elegido más amplio que lo incluye y su lugar. */
  coveredBy: { id: string; name: string; position: number } | null;
}

/** Estado del rubro de un producto en el orden de su marca. null = sin rubro de Tango. */
export function rubroHighlightFor(index: BrandListingIndex, categoryOrder: readonly string[], categoryId: string | null): RubroHighlight | null {
  const placement = index.placementOf(categoryId);
  if (!placement.groupId) return null;
  const at = categoryOrder.indexOf(placement.groupId);
  const coveredBy =
    at < 0 && placement.chosenId && placement.chosenId !== placement.groupId
      ? { id: placement.chosenId, name: index.nameOf(placement.chosenId), position: categoryOrder.indexOf(placement.chosenId) }
      : null;
  return {
    rubroId: placement.groupId,
    rubroName: index.nameOf(placement.groupId),
    rubroContext: index.contextOf(placement.groupId),
    position: at >= 0 ? at : null,
    coveredBy,
  };
}

/** Nuevo orden al destacar (va 1.º) o sacar (deja el orden) el rubro de un producto. */
export function toggleRubroFirst(categoryOrder: readonly string[], rubroId: string, first: boolean): string[] {
  const rest = categoryOrder.filter((id) => id !== rubroId);
  return first ? [rubroId, ...rest] : rest;
}

/** «1.º», «2.º»… */
export function ordinal(position: number): string {
  return `${position + 1}.º`;
}
