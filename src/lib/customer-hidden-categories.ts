import { prisma } from "@/lib/prisma";
import { categoryWithDescendants } from "@/lib/category-tree";

/**
 * Rubros que solo ve el equipo de Soundtec: no aparecen en el portal del
 * cliente ni en el catálogo público (filtros, columna de rubros, conteos ni
 * resultados). Hoy: Indumentaria (ropa de trabajo y uniformes propios), con
 * todo lo que cuelga de ella.
 */
const HIDDEN_TANGO_PATHS = ["INSUMOS GENERALES > INDUMENTARIA"];
const HIDDEN_NAMES = ["indumentaria"];

export function isCustomerHiddenCategory(category: { name: string; tangoPath?: string | null }): boolean {
  const path = category.tangoPath?.trim().toUpperCase();
  if (path && HIDDEN_TANGO_PATHS.some((hidden) => path === hidden || path.startsWith(`${hidden} > `))) return true;
  return HIDDEN_NAMES.includes(category.name.trim().toLowerCase());
}

/** Los ids ocultos más todos sus descendientes. */
export function hiddenCategoryIdsFrom(
  rows: Array<{ id: string; parentId: string | null; name: string; tangoPath?: string | null }>
): string[] {
  const roots = rows.filter((row) => isCustomerHiddenCategory(row)).map((row) => row.id);
  return [...new Set(roots.flatMap((id) => categoryWithDescendants(id, rows)))];
}

let cache: { at: number; ids: string[] } | null = null;
const CACHE_MS = 5 * 60_000;

/** Ids de rubros ocultos para clientes (cache de 5 minutos, como el árbol). */
export async function customerHiddenCategoryIds(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ids;
  const rows = await prisma.category.findMany({ select: { id: true, parentId: true, name: true, tangoPath: true } });
  cache = { at: Date.now(), ids: hiddenCategoryIdsFrom(rows) };
  return cache.ids;
}
