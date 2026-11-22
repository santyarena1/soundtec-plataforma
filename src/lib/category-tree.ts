import { prisma } from "@/lib/prisma";
import { isCustomerTreeNode } from "@/lib/tango-only";

/** Nodo del árbol de rubros tal como lo usan los selectores y filtros. */
export type CategoryNode = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  /** Productos activos con este rubro (sin contar los de abajo). */
  count?: number;
  /** Creado en la app, falta cargarlo en Tango. */
  pendingTango?: boolean;
};

/**
 * Rubros para elegir: el árbol de Tango si está cargado; si no, las categorías
 * viejas (planas, todas nivel 1). Ordenado por nombre.
 */
export async function listCategoryTree(): Promise<CategoryNode[]> {
  const [tango, counts] = await Promise.all([
    prisma.category.findMany({
      where: { tangoPath: { not: null }, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, parentId: true, level: true, pendingTango: true },
    }),
    prisma.product.groupBy({ by: ["categoryId"], _count: { _all: true }, where: { isActive: true, categoryId: { not: null } } }),
  ]);
  const countById = new Map(counts.map((row) => [row.categoryId, row._count._all]));
  if (tango.length) {
    return tango.map((c) => ({ ...c, level: c.level ?? 1, count: countById.get(c.id) ?? 0, pendingTango: c.pendingTango || undefined }));
  }
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

/**
 * Camino del rubro de un producto, del principal al suyo («Sonido», «Bafles
 * pasivos», «Techo»). Para el cliente (`customer`), vacío si el rubro no es del
 * árbol de Tango o es «Sin categorizar».
 */
export async function productCategoryCrumbs(
  categoryId: string | null | undefined,
  { customer }: { customer: boolean }
): Promise<Array<{ id: string; name: string }>> {
  if (!categoryId) return [];
  const path: Array<{ id: string; name: string; slug: string | null; tangoPath: string | null }> = [];
  const seen = new Set<string>();
  let nextId: string | null = categoryId;
  while (nextId && !seen.has(nextId) && path.length < 10) {
    seen.add(nextId);
    const node: { id: string; name: string; slug: string | null; tangoPath: string | null; parentId: string | null } | null =
      await prisma.category.findUnique({
        where: { id: nextId },
        select: { id: true, name: true, slug: true, tangoPath: true, parentId: true },
      });
    if (!node) break;
    path.unshift(node);
    nextId = node.parentId;
  }
  if (customer && (path.length === 0 || path.some((n) => !isCustomerTreeNode(n)))) return [];
  return path.map((n) => ({ id: n.id, name: n.name }));
}

/** Nombre para mostrar de cualquier categoría: ruta completa si es del árbol, el nombre si es vieja. */
export async function categoryLabelMap(): Promise<Map<string, string>> {
  const rows = await prisma.category.findMany({ select: { id: true, name: true, parentId: true, tangoPath: true } });
  const nodes = rows.map((r) => ({ id: r.id, name: r.name, parentId: r.parentId, level: 1 }));
  return new Map(rows.map((r) => [r.id, r.tangoPath ? categoryPathLabel(r.id, nodes) : r.name]));
}

/** Series del fabricante para elegir en reglas (alcance «Serie»): «Sonance · Landscape». */
export async function lineOptions(): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.productLine.findMany({
    select: { id: true, name: true, brand: { select: { name: true } } },
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, name: `${r.brand.name} · ${r.name}` }));
}
