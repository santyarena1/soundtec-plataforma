import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UNCATEGORIZED_NAME, UNCATEGORIZED_SLUG } from "@/lib/tango-only";
import { TANGO_BATCH } from "@/server/category-proposals";

type Db = PrismaClient | Prisma.TransactionClient;

/** Tanda donde se guarda la categoría vieja de cada producto que pasó a «Sin categorizar». */
export const UNCATEGORIZED_BATCH = "sin-categorizar-2026-11";

/** Crea (o reactiva) la categoría temporal «Sin categorizar» y devuelve su id. */
export async function ensureUncategorizedCategory(db: Db = prisma): Promise<string> {
  const row = await db.category.upsert({
    where: { slug: UNCATEGORIZED_SLUG },
    create: { name: UNCATEGORIZED_NAME, slug: UNCATEGORIZED_SLUG, level: 1, isActive: true },
    update: { isActive: true, tangoPath: null, parentId: null },
    select: { id: true },
  });
  return row.id;
}

/** Id de «Sin categorizar», si existe. */
export async function findUncategorizedCategoryId(db: Db = prisma): Promise<string | null> {
  return (await db.category.findUnique({ where: { slug: UNCATEGORIZED_SLUG }, select: { id: true } }))?.id ?? null;
}

/**
 * Productos para revisar uno a uno: en «Sin categorizar», sin rubro (lo que
 * entra nuevo por sincronización o importación) o con una categoría vieja
 * fuera del árbol de Tango.
 */
export async function uncategorizedProductWhere(db: Db = prisma): Promise<Prisma.ProductWhereInput> {
  void db;
  return { OR: [{ categoryId: null }, { category: { tangoPath: null } }] };
}

/**
 * Bandeja «Para revisar uno a uno»: el producto pasa al rubro de Tango elegido.
 * Si tenía una propuesta pendiente de la reclasificación, queda decidida (y se
 * puede deshacer desde «Lo que ya decidiste»).
 */
export async function assignFromUncategorized(productId: string, categoryId: string, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const [node, product] = await Promise.all([
    prisma.category.findUnique({ where: { id: categoryId }, select: { tangoPath: true, isActive: true } }),
    prisma.product.findUnique({ where: { id: productId }, select: { categoryId: true, category: { select: { tangoPath: true } } } }),
  ]);
  if (!node?.tangoPath || !node.isActive) return { ok: false, error: "Elegí un rubro del árbol de Tango." };
  if (!product) return { ok: false, error: "No encontré el producto." };
  // Solo productos sin rubro, en «Sin categorizar» o con una categoría vieja (fuera del árbol).
  if (product.categoryId && product.category?.tangoPath) return { ok: false, error: "Ese producto ya tiene rubro." };
  const now = new Date();
  await prisma.$transaction([
    prisma.product.update({ where: { id: productId }, data: { categoryId } }),
    prisma.categoryProposal.updateMany({
      where: { productId, batch: TANGO_BATCH, status: "PENDING" },
      data: { status: "APPROVED", tangoPath: node.tangoPath, appliedPath: node.tangoPath, previousCategoryId: product.categoryId, decidedById: userId, decidedAt: now },
    }),
    prisma.categoryProposal.updateMany({
      where: { productId, batch: UNCATEGORIZED_BATCH, status: "PENDING" },
      data: { status: "APPROVED", appliedPath: node.tangoPath, decidedById: userId, decidedAt: now },
    }),
  ]);
  return { ok: true };
}

/** Cuántos productos activos esperan rubro. */
export async function countUncategorizedProducts(db: Db = prisma): Promise<number> {
  return db.product.count({ where: { AND: [{ isActive: true }, await uncategorizedProductWhere(db)] } });
}
