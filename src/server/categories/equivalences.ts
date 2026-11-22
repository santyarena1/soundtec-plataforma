/**
 * Equivalencias proveedor → rubro, del lado del servidor. Punto único para
 * que importadores, sincronizaciones y la IA ubiquen productos nuevos:
 * `resolveRubroByEquivalence`. Sin equivalencia → «Sin categorizar» (bandeja).
 */
import { prisma } from "@/lib/prisma";
import { ensureUncategorizedCategory, findUncategorizedCategoryId } from "@/server/uncategorized";
import { deriveEquivalences, equivalenceKey, equivalenceLookupOrder, type EquivalenceCandidate } from "@/lib/category-equivalence";
import type { Db } from "@/server/pricing/rule-save";

export interface EquivalenceQuery {
  /** sonance, crestron, soundtube, hall, excel, ai, sync… */
  source: string;
  brandId?: string | null;
  /** Categoría o ruta tal como la trae el proveedor. */
  sourcePath?: string | null;
}

/** Rubro de Tango para esa ruta del proveedor, o null si no hay equivalencia (o el rubro ya no está activo). */
export async function findRubroByEquivalence(db: Db, query: EquivalenceQuery): Promise<string | null> {
  const sourceKey = equivalenceKey(query.sourcePath);
  if (!sourceKey) return null;
  const order = equivalenceLookupOrder(query.source, query.brandId ?? "");
  const rows = await db.categoryEquivalence.findMany({
    where: { sourceKey, OR: order.map((o) => ({ source: o.source, brandKey: o.brandKey })) },
    select: { source: true, brandKey: true, categoryId: true, category: { select: { tangoPath: true, isActive: true } } },
  });
  for (const o of order) {
    const hit = rows.find((r) => r.source === o.source && r.brandKey === o.brandKey);
    if (hit && hit.category.tangoPath && hit.category.isActive) return hit.categoryId;
  }
  return null;
}

/** Id de «Sin categorizar» (la bandeja). Se crea si falta, igual que en la reclasificación. */
export async function uncategorizedCategoryId(db: Db = prisma): Promise<string> {
  return (await findUncategorizedCategoryId(db)) ?? ensureUncategorizedCategory(db);
}

/**
 * Rubro para un producto NUEVO: el de la equivalencia o «Sin categorizar».
 * Devuelve también si encontró equivalencia, para avisar «N productos nuevos sin rubro».
 */
export async function resolveRubroForNewProduct(db: Db, query: EquivalenceQuery): Promise<{ categoryId: string; matched: boolean }> {
  const found = await findRubroByEquivalence(db, query);
  if (found) return { categoryId: found, matched: true };
  return { categoryId: await uncategorizedCategoryId(db), matched: false };
}

/**
 * Equivalencias sugeridas a partir de los productos ya ubicados en el árbol
 * (misma ruta de proveedor y marca → mismo rubro en ≥90 % y al menos 3
 * productos). Se guardan como SUGGESTED con fuente «*»; no pisan las que ya
 * existen. Devuelve lo que crearía (o creó).
 */
export async function suggestEquivalencesFromProducts(
  db: Db,
  options: { apply: boolean; createdBy?: string | null }
): Promise<{ candidates: EquivalenceCandidate[]; created: number; skipped: number }> {
  const products = await db.product.findMany({
    where: { isActive: true, sourceCategoryPath: { not: null }, category: { tangoPath: { not: null }, isActive: true } },
    select: { brandId: true, sourceCategoryPath: true, categoryId: true, brand: { select: { name: true } } },
  });
  const candidates = deriveEquivalences(
    products.map((p) => ({ brandKey: p.brandId ?? "", brandName: p.brand?.name ?? null, sourcePath: p.sourceCategoryPath, categoryId: p.categoryId }))
  );
  const existing = await db.categoryEquivalence.findMany({ where: { source: "*" }, select: { brandKey: true, sourceKey: true } });
  const taken = new Set(existing.map((e) => `${e.brandKey}::${e.sourceKey}`));
  const fresh = candidates.filter((c) => !taken.has(`${c.brandKey}::${c.sourceKey}`));
  if (options.apply && fresh.length) {
    await db.categoryEquivalence.createMany({
      data: fresh.map((c) => ({
        source: "*",
        brandKey: c.brandKey,
        sourceKey: c.sourceKey,
        sourceLabel: c.sourceLabel,
        categoryId: c.categoryId,
        status: "SUGGESTED",
        sampleCount: c.sampleCount,
        sampleShare: c.sampleShare,
        createdBy: options.createdBy ?? "sugerida por productos ya ubicados",
      })),
      skipDuplicates: true,
    });
  }
  return { candidates, created: options.apply ? fresh.length : 0, skipped: candidates.length - fresh.length };
}
