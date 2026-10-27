import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { parseTangoTree, tangoDisplayName } from "@/lib/tango-tree";

/** Tanda de la reclasificación con el árbol de Tango (octubre 2026). */
export const TANGO_BATCH = "tango-2026-10";
const DATA_DIR = join(process.cwd(), "data", "tango");

type ProposalFile = Array<{ id: string; sku: string | null; ruta: string; confianza: "alta" | "media" | "baja"; nota: string | null }>;

/**
 * Carga el árbol de Tango como categorías (si falta) y crea las propuestas de
 * la tanda para los productos que existen (por id o, si no, por SKU). No mueve
 * ningún producto: eso pasa recién al aprobar. Se puede correr de nuevo sin duplicar.
 */
export async function loadTangoProposals(): Promise<{ nodes: number; created: number; skipped: number; branches: number }> {
  const nodes = parseTangoTree(await readFile(join(DATA_DIR, "arbol-rubros.csv"), "utf8"));
  const idByPath = new Map(
    (await prisma.category.findMany({ where: { tangoPath: { not: null } }, select: { id: true, tangoPath: true } })).map((c) => [c.tangoPath!, c.id]),
  );
  // Por nivel: el padre tiene que existir antes que el hijo.
  for (let level = 1; level <= 4; level++) {
    const missing = nodes.filter((n) => n.level === level && !idByPath.has(n.path));
    if (missing.length) {
      await prisma.category.createMany({
        data: missing.map((n) => ({
          name: tangoDisplayName(n.parts[n.parts.length - 1]!),
          slug: `t-${slugify(n.path).slice(0, 180)}`,
          tangoPath: n.path,
          level: n.level,
          parentId: n.parentPath ? idByPath.get(n.parentPath) ?? null : null,
        })),
        skipDuplicates: true,
      });
      const created = await prisma.category.findMany({ where: { tangoPath: { in: missing.map((n) => n.path) } }, select: { id: true, tangoPath: true } });
      for (const c of created) idByPath.set(c.tangoPath!, c.id);
    }
  }

  const proposals = JSON.parse(await readFile(join(DATA_DIR, `propuestas-2026-10.json`), "utf8")) as ProposalFile;
  const products = await prisma.product.findMany({ select: { id: true, internalSku: true } });
  const ids = new Set(products.map((p) => p.id));
  const idBySku = new Map(products.filter((p) => p.internalSku).map((p) => [p.internalSku!, p.id]));
  const rows = proposals
    .map((p) => ({ ...p, productId: ids.has(p.id) ? p.id : p.sku ? idBySku.get(p.sku) : undefined }))
    .filter((p): p is (typeof p & { productId: string }) => Boolean(p.productId) && idByPath.has(p.ruta));
  const result = await prisma.categoryProposal.createMany({
    data: rows.map((p) => ({ productId: p.productId, batch: TANGO_BATCH, tangoPath: p.ruta, confidence: p.confianza, note: p.nota })),
    skipDuplicates: true,
  });
  const branches = await loadBranchSuggestions(new Set(rows.map((r) => r.productId)));
  return { nodes: idByPath.size, created: result.count, skipped: proposals.length - result.count, branches };
}

type BranchFile = Array<{ ruta: string; motivo: string; productos: string[] }>;

/** Ramas nuevas sugeridas (archivo opcional): se guardan pendientes, sin crear rubros. */
async function loadBranchSuggestions(existingProducts: Set<string>): Promise<number> {
  let file: BranchFile;
  try {
    file = JSON.parse(await readFile(join(DATA_DIR, "ramas-sugeridas.json"), "utf8")) as BranchFile;
  } catch {
    return 0;
  }
  const r = await prisma.tangoBranchSuggestion.createMany({
    data: file.map((b) => ({ batch: TANGO_BATCH, tangoPath: b.ruta, reason: b.motivo, productIds: b.productos.filter((id) => existingProducts.has(id)) })),
    skipDuplicates: true,
  });
  return r.count;
}

/**
 * Aprueba una rama nueva: crea el rubro (y sus padres sugeridos si faltan),
 * pasa ahí las propuestas pendientes de sus productos (quedan seguras, para
 * aprobar) y mueve los que ya estaban aprobados en otro rubro.
 */
export async function approveBranchSuggestion(id: string, userId: string): Promise<{ moved: number; pending: number } | null> {
  const branch = await prisma.tangoBranchSuggestion.findUnique({ where: { id } });
  if (!branch || branch.status !== "PENDING") return null;
  const parts = branch.tangoPath.split(" > ");
  let parentId: string | null = null;
  for (let level = 1; level <= parts.length; level++) {
    const path = parts.slice(0, level).join(" > ");
    const existing = await prisma.category.findUnique({ where: { tangoPath: path }, select: { id: true } });
    const node: { id: string } =
      existing ??
      (await prisma.category.create({
        data: { name: tangoDisplayName(parts[level - 1]!), slug: `t-${slugify(path).slice(0, 180)}`, tangoPath: path, level, parentId },
        select: { id: true },
      }));
    parentId = node.id;
  }
  const nodeId = parentId!;
  const note = `Rama nueva: ${branch.reason ?? branch.tangoPath}`;
  return prisma.$transaction(async (tx) => {
    const pending = await tx.categoryProposal.updateMany({
      where: { batch: TANGO_BATCH, status: "PENDING", productId: { in: branch.productIds } },
      data: { tangoPath: branch.tangoPath, confidence: "alta", note },
    });
    const approved = await tx.categoryProposal.findMany({ where: { batch: TANGO_BATCH, status: "APPROVED", productId: { in: branch.productIds } }, select: { id: true, productId: true } });
    if (approved.length) {
      await tx.product.updateMany({ where: { id: { in: approved.map((a) => a.productId) } }, data: { categoryId: nodeId } });
      await tx.categoryProposal.updateMany({ where: { id: { in: approved.map((a) => a.id) } }, data: { tangoPath: branch.tangoPath, appliedPath: branch.tangoPath, note } });
    }
    await tx.tangoBranchSuggestion.update({ where: { id }, data: { status: "APPROVED", decidedById: userId, decidedAt: new Date() } });
    return { moved: approved.length, pending: pending.count };
  });
}

export async function rejectBranchSuggestion(id: string, userId: string): Promise<boolean> {
  const r = await prisma.tangoBranchSuggestion.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", decidedById: userId, decidedAt: new Date() } });
  return r.count > 0;
}

/**
 * Aprueba propuestas pendientes: cada producto pasa al rubro propuesto (o al
 * elegido a mano). Guarda el rubro anterior para poder deshacer.
 */
export async function approveProposals(where: { ids?: string[]; confidence?: string }, userId: string, overridePath?: string): Promise<number> {
  const filter = Prisma.sql`cp."batch" = ${TANGO_BATCH} AND cp."status" = 'PENDING'
    ${where.ids?.length ? Prisma.sql`AND cp."id" IN (${Prisma.join(where.ids)})` : Prisma.empty}
    ${where.confidence ? Prisma.sql`AND cp."confidence" = ${where.confidence}` : Prisma.empty}`;
  return prisma.$transaction(async (tx) => {
    if (overridePath) {
      await tx.$executeRaw`UPDATE "CategoryProposal" cp SET "tangoPath" = ${overridePath} WHERE ${filter}`;
    }
    await tx.$executeRaw`UPDATE "CategoryProposal" cp SET "previousCategoryId" = p."categoryId" FROM "Product" p WHERE p."id" = cp."productId" AND ${filter}`;
    await tx.$executeRaw`UPDATE "Product" p SET "categoryId" = c."id", "updatedAt" = NOW()
      FROM "CategoryProposal" cp JOIN "Category" c ON c."tangoPath" = cp."tangoPath"
      WHERE p."id" = cp."productId" AND ${filter}`;
    return tx.$executeRaw`UPDATE "CategoryProposal" cp SET "status" = 'APPROVED', "appliedPath" = cp."tangoPath", "decidedById" = ${userId}, "decidedAt" = NOW()
      WHERE ${filter} AND EXISTS (SELECT 1 FROM "Category" c WHERE c."tangoPath" = cp."tangoPath")`;
  }, { timeout: 120_000 });
}

/** Rechaza propuestas: el producto queda como está. */
export async function rejectProposals(ids: string[], userId: string): Promise<number> {
  const r = await prisma.categoryProposal.updateMany({
    where: { id: { in: ids }, batch: TANGO_BATCH, status: "PENDING" },
    data: { status: "REJECTED", decidedById: userId, decidedAt: new Date() },
  });
  return r.count;
}

/** Deshace una aprobación: el producto vuelve al rubro que tenía y la propuesta queda pendiente. */
export async function undoProposal(id: string): Promise<boolean> {
  const p = await prisma.categoryProposal.findUnique({ where: { id } });
  if (!p || p.batch !== TANGO_BATCH || p.status === "PENDING") return false;
  await prisma.$transaction([
    ...(p.status === "APPROVED" ? [prisma.product.update({ where: { id: p.productId }, data: { categoryId: p.previousCategoryId } })] : []),
    prisma.categoryProposal.update({ where: { id }, data: { status: "PENDING", appliedPath: null, previousCategoryId: null, decidedById: null, decidedAt: null } }),
  ]);
  return true;
}

/** Categorías viejas (fuera del árbol) que ya no tienen productos: se desactivan, no se borran. */
export async function deactivateEmptyLegacyCategories(): Promise<number> {
  const r = await prisma.category.updateMany({ where: { tangoPath: null, isActive: true, products: { none: {} } }, data: { isActive: false } });
  return r.count;
}
