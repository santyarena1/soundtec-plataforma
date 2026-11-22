import { prisma } from "@/lib/prisma";
import { categoryWithDescendants } from "@/lib/category-tree";

/**
 * Rubros que solo ve el equipo de Soundtec: no aparecen en el portal del
 * cliente ni en el catálogo público (filtros, columna de rubros, conteos ni
 * resultados), con todo lo que cuelga de ellos.
 *
 * Se marcan en Rubros › Árbol («Ocultar a clientes»): campo
 * Category.hiddenFromCustomers. Mientras ningún rubro tenga el campo marcado
 * (base recién actualizada, antes de correr scripts/rubros-ocultos-apply.ts),
 * vale la lista de siempre: Indumentaria (ropa de trabajo propia) y Servicios.
 */
export const DEFAULT_HIDDEN_TANGO_PATHS = ["INSUMOS GENERALES > INDUMENTARIA", "SERVICIOS"];
const DEFAULT_HIDDEN_NAMES = ["indumentaria", "servicios"];

type HiddenRow = { id: string; parentId: string | null; name: string; tangoPath?: string | null; hiddenFromCustomers?: boolean | null };

/** ¿Está en la lista de siempre (Indumentaria / Servicios)? */
export function isDefaultHiddenCategory(category: { name: string; tangoPath?: string | null }): boolean {
  const path = category.tangoPath?.trim().toUpperCase();
  if (path && DEFAULT_HIDDEN_TANGO_PATHS.some((hidden) => path === hidden || path.startsWith(`${hidden} > `))) return true;
  return DEFAULT_HIDDEN_NAMES.includes(category.name.trim().toLowerCase());
}

/** Compatibilidad: igual que antes (lista de siempre). */
export function isCustomerHiddenCategory(category: { name: string; tangoPath?: string | null }): boolean {
  return isDefaultHiddenCategory(category);
}

/** Los ids ocultos más todos sus descendientes: por el campo; si nadie lo tiene marcado, por la lista de siempre. */
export function hiddenCategoryIdsFrom(rows: HiddenRow[]): string[] {
  const anyMarked = rows.some((row) => row.hiddenFromCustomers);
  const roots = rows
    .filter((row) => (anyMarked ? Boolean(row.hiddenFromCustomers) : isDefaultHiddenCategory(row)))
    .map((row) => row.id);
  return [...new Set(roots.flatMap((id) => categoryWithDescendants(id, rows)))];
}

let cache: { at: number; ids: string[] } | null = null;
const CACHE_MS = 5 * 60_000;

/** Vacía la caché (al ocultar o mostrar un rubro desde la pantalla Rubros). */
export function resetCustomerHiddenCache(): void {
  cache = null;
}

/** Ids de rubros ocultos para clientes (cache de 5 minutos, como el árbol). */
export async function customerHiddenCategoryIds(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ids;
  const rows = await prisma.category.findMany({
    select: { id: true, parentId: true, name: true, tangoPath: true, hiddenFromCustomers: true },
  });
  cache = { at: Date.now(), ids: hiddenCategoryIdsFrom(rows) };
  return cache.ids;
}
