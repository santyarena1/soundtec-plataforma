/**
 * Rubro para un producto NUEVO que crea un importador o una sincronización.
 * Usa la tabla de Equivalencias (resolveRubroForNewProduct) con la ruta que
 * trae el proveedor; sin equivalencia va a «Sin categorizar». Nunca crea
 * categorías. Solo para altas: a los productos existentes no se les toca el rubro.
 */
import { isTangoTreeActive } from "@/lib/tango-tree-db";
import { resolveRubroForNewProduct } from "@/server/categories/equivalences";
import type { Db } from "@/server/pricing/rule-save";

export interface NewProductRubro {
  categoryId: string;
  /** true = salió de una equivalencia; false = quedó en «Sin categorizar». */
  matched: boolean;
  /** Ruta del proveedor tal como llegó (para Product.sourceCategoryPath), si había. */
  sourceCategoryPath?: string;
}

/**
 * null mientras el árbol de Tango no esté cargado (el importador sigue con su
 * comportamiento anterior). Con el árbol: el rubro de la equivalencia o «Sin categorizar».
 */
export async function rubroForNewProduct(
  db: Db,
  query: { source: string; brandId?: string | null; sourcePath?: string | null }
): Promise<NewProductRubro | null> {
  if (!(await isTangoTreeActive(db))) return null;
  const sourcePath = query.sourcePath?.trim() || undefined;
  const { categoryId, matched } = await resolveRubroForNewProduct(db, { source: query.source, brandId: query.brandId ?? null, sourcePath });
  return { categoryId, matched, sourceCategoryPath: sourcePath };
}
