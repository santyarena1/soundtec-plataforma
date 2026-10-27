import { prisma } from "@/lib/prisma";

/** Nodo del árbol de rubros tal como lo usan los selectores y filtros. */
export type CategoryNode = { id: string; name: string; parentId: string | null; level: number };

/**
 * Rubros para elegir: el árbol de Tango si está cargado; si no, las categorías
 * viejas (planas, todas nivel 1). Ordenado por nombre.
 */
export async function listCategoryTree(): Promise<CategoryNode[]> {
  const tango = await prisma.category.findMany({
    where: { tangoPath: { not: null }, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, parentId: true, level: true },
  });
  if (tango.length) return tango.map((c) => ({ ...c, level: c.level ?? 1 }));
  const flat = await prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return flat.map((c) => ({ ...c, parentId: null, level: 1 }));
}

/**
 * Opciones para filtrar por rubro: cada nodo que tiene productos (él o algo
 * debajo), con la ruta completa como nombre y ordenado por ruta.
 */
export async function categoryFilterOptions(): Promise<Array<{ id: string; name: string }>> {
  const [nodes, counts] = await Promise.all([
    listCategoryTree(),
    prisma.product.groupBy({ by: ["categoryId"], _count: { _all: true }, where: { categoryId: { not: null } } }),
  ]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const used = new Set<string>();
  for (const row of counts) {
    let current = row.categoryId ? byId.get(row.categoryId) : undefined;
    while (current && !used.has(current.id)) {
      used.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return nodes
    .filter((n) => used.has(n.id))
    .map((n) => ({ id: n.id, name: categoryPathLabel(n.id, nodes) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Ruta legible de un nodo («Sonido › Bafles pasivos › Bafles de embutir»). */
export function categoryPathLabel(id: string | null | undefined, nodes: CategoryNode[]): string {
  if (!id) return "";
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parts: string[] = [];
  let current = byId.get(id);
  while (current) {
    parts.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return parts.join(" › ");
}

let parentsCache: { at: number; rows: Array<{ id: string; parentId: string | null }> } | null = null;

/** Los rubros pedidos más todo lo que cuelga de ellos (filtrar «Sonido» trae también sus subrubros). */
export async function expandCategoryIds(ids: string[]): Promise<string[]> {
  if (!ids.length) return ids;
  if (!parentsCache || Date.now() - parentsCache.at > 5 * 60_000) {
    parentsCache = { at: Date.now(), rows: await prisma.category.findMany({ select: { id: true, parentId: true } }) };
  }
  const rows = parentsCache.rows;
  return [...new Set(ids.flatMap((id) => categoryWithDescendants(id, rows)))];
}

/** El nodo y todos sus descendientes (para filtrar «todo Sonido»). */
export function categoryWithDescendants(id: string, nodes: Array<Pick<CategoryNode, "id" | "parentId">>): string[] {
  const children = new Map<string, string[]>();
  for (const n of nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id]);
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const next = stack.pop()!;
    out.push(next);
    stack.push(...(children.get(next) ?? []));
  }
  return out;
}
