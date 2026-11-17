/**
 * Árbol de rubros del catálogo con la cantidad de productos de cada nodo
 * (sus productos más los de todo lo que cuelga de él). Sin base de datos:
 * recibe los nodos y los conteos por rubro ya calculados.
 */
export type CategoryCountNode = { id: string; name: string; parentId: string | null; count: number };

type RawNode = { id: string; name: string; parentId: string | null };

/** Nodos con productos (propios o de sus subrubros), ordenados por cantidad y nombre. */
export function buildCategoryCountTree(
  nodes: RawNode[],
  groups: Array<{ categoryId: string | null; count: number }>
): CategoryCountNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const counts = new Map<string, number>();
  for (const group of groups) {
    if (!group.categoryId || group.count <= 0) continue;
    const seen = new Set<string>();
    let current = byId.get(group.categoryId);
    // El conteo sube por toda la rama (cortando ciclos por las dudas).
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      counts.set(current.id, (counts.get(current.id) ?? 0) + group.count);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return nodes
    .filter((n) => counts.has(n.id))
    .map((n) => ({
      id: n.id,
      name: n.name,
      parentId: n.parentId && counts.has(n.parentId) ? n.parentId : null,
      count: counts.get(n.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

/** Camino desde el rubro principal hasta el nodo («Sonido», «Bafles», «Techo»). Vacío si no está. */
export function categoryAncestry<T extends { id: string; parentId: string | null }>(id: string | null | undefined, nodes: T[]): T[] {
  if (!id) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Hijos directos de un nodo (null = rubros principales), en el orden recibido. */
export function categoryChildren<T extends { parentId: string | null }>(parentId: string | null, nodes: T[]): T[] {
  return nodes.filter((n) => n.parentId === parentId);
}
