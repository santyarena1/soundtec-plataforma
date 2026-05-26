"use server";

export const maxDuration = 300;

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { slugify } from "@/lib/utils";
import { suggestTaxonomyAssignment, suggestTaxonomyAssignmentBatch } from "@/services/openai";
import { TaxonomySuggestionKind, TaxonomySuggestionStatus } from "@prisma/client";

const MINI_BATCH = 15;

function revalidateTaxonomyPaths(kind: TaxonomySuggestionKind) {
  revalidatePath(kind === "CATEGORY" ? "/admin/categories" : "/admin/families");
  revalidatePath("/admin/products");
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

async function resolveTargetId(
  kind: TaxonomySuggestionKind,
  suggestedName: string
): Promise<string | null> {
  const normalized = normalizeName(suggestedName);
  if (!normalized) return null;

  if (kind === "CATEGORY") {
    const list = await prisma.category.findMany({ select: { id: true, name: true } });
    const exact = list.find((c) => normalizeName(c.name) === normalized);
    if (exact) return exact.id;
    const fuzzy = list.find((c) => {
      const n = normalizeName(c.name);
      return n.length >= 3 && (normalized.includes(n) || n.includes(normalized));
    });
    return fuzzy?.id ?? null;
  }

  const list = await prisma.productFamily.findMany({ select: { id: true, name: true } });
  const exact = list.find((f) => normalizeName(f.name) === normalized);
  if (exact) return exact.id;
  const fuzzy = list.find((f) => {
    const n = normalizeName(f.name);
    return n.length >= 3 && (normalized.includes(n) || n.includes(normalized));
  });
  return fuzzy?.id ?? null;
}

async function ensureTaxonomyAndAssign(
  kind: TaxonomySuggestionKind,
  productId: string,
  suggestedName: string,
  targetId: string | null,
  createIfMissing: boolean
): Promise<{ ok: boolean; error?: string }> {
  let resolvedId = targetId;

  if (!resolvedId) {
    resolvedId = await resolveTargetId(kind, suggestedName);
  }

  if (!resolvedId && createIfMissing) {
    if (kind === "CATEGORY") {
      const created = await prisma.category.create({
        data: { name: suggestedName, slug: slugify(suggestedName) },
      });
      resolvedId = created.id;
    } else {
      const created = await prisma.productFamily.create({
        data: { name: suggestedName, slug: slugify(suggestedName), isActive: true },
      });
      resolvedId = created.id;
    }
  }

  if (!resolvedId) {
    return { ok: false, error: "No existe en el catálogo. Usá «Crear y asignar» o «Aplicar todo»." };
  }

  if (kind === "CATEGORY") {
    await prisma.product.update({ where: { id: productId }, data: { categoryId: resolvedId } });
  } else {
    await prisma.product.update({ where: { id: productId }, data: { familyId: resolvedId } });
  }

  return { ok: true };
}

/** Borra todas las categorías/familias y resetea los productos. Permite empezar de cero. */
export async function clearAllTaxonomyData(
  kind: TaxonomySuggestionKind
): Promise<{ ok: boolean; deleted: number }> {
  await requireAdmin();

  // Primero romper la FK en productos
  if (kind === "CATEGORY") {
    await prisma.product.updateMany({ where: { categoryId: { not: null } }, data: { categoryId: null } });
    await prisma.taxonomySuggestion.deleteMany({ where: { kind } });
    const result = await prisma.category.deleteMany({});
    revalidatePath("/admin/categories");
    revalidatePath("/admin/products");
    return { ok: true, deleted: result.count };
  } else {
    await prisma.product.updateMany({ where: { familyId: { not: null } }, data: { familyId: null } });
    await prisma.taxonomySuggestion.deleteMany({ where: { kind } });
    const result = await prisma.productFamily.deleteMany({});
    revalidatePath("/admin/families");
    revalidatePath("/admin/products");
    return { ok: true, deleted: result.count };
  }
}

/** Analiza productos sin categoría/familia (flujo de revisión manual). */
export async function generateTaxonomySuggestions(
  kind: TaxonomySuggestionKind
): Promise<{ ok: boolean; created: number; skipped: number; error?: string }> {
  await requireAdmin();

  const field = kind === "CATEGORY" ? "categoryId" : "familyId";
  const products = await prisma.product.findMany({
    where: { isActive: true, [field]: null },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, normalizedName: true, internalSku: true, shortDescription: true },
  });

  if (products.length === 0) {
    return { ok: true, created: 0, skipped: 0, error: "No hay productos sin asignar." };
  }

  const pendingProductIds = new Set(
    (
      await prisma.taxonomySuggestion.findMany({
        where: { kind, status: TaxonomySuggestionStatus.PENDING, productId: { in: products.map((p) => p.id) } },
        select: { productId: true },
      })
    ).map((s) => s.productId)
  );

  const toProcess = products.filter((p) => !pendingProductIds.has(p.id));
  let created = 0;
  const skipped = products.length - toProcess.length;

  for (let i = 0; i < toProcess.length; i += MINI_BATCH) {
    const chunk = toProcess.slice(i, i + MINI_BATCH);

    const taxonomyCatalog =
      kind === "CATEGORY"
        ? (await prisma.category.findMany({ select: { name: true } })).map((c) => c.name)
        : (await prisma.productFamily.findMany({ select: { name: true } })).map((f) => f.name);

    const batchResults = await suggestTaxonomyAssignmentBatch({
      kind,
      products: chunk.map((p) => ({ id: p.id, name: p.normalizedName, sku: p.internalSku, description: p.shortDescription })),
      taxonomyCatalog,
    });

    for (const result of batchResults) {
      if (!result.name) continue;
      const targetId = result.action === "existing" ? await resolveTargetId(kind, result.name) : null;
      await prisma.taxonomySuggestion.create({
        data: { kind, productId: result.id, suggestedName: result.name, targetId, confidence: result.confidence },
      });
      created++;
    }
  }

  revalidateTaxonomyPaths(kind);
  return { ok: true, created, skipped };
}

export async function acceptTaxonomySuggestion(
  suggestionId: string,
  options?: { createIfMissing?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const row = await prisma.taxonomySuggestion.findUnique({
    where: { id: suggestionId },
    include: { product: { select: { id: true, normalizedName: true } } },
  });
  if (!row || row.status !== TaxonomySuggestionStatus.PENDING) {
    return { ok: false, error: "Sugerencia no encontrada o ya resuelta." };
  }

  const assign = await ensureTaxonomyAndAssign(
    row.kind,
    row.productId,
    row.suggestedName,
    row.targetId,
    options?.createIfMissing ?? !row.targetId
  );
  if (!assign.ok) return assign;

  await prisma.taxonomySuggestion.update({
    where: { id: suggestionId },
    data: { status: TaxonomySuggestionStatus.ACCEPTED, resolvedAt: new Date() },
  });

  revalidateTaxonomyPaths(row.kind);
  revalidatePath(`/admin/products/${row.productId}`);
  return { ok: true };
}

export async function rejectTaxonomySuggestion(suggestionId: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  const row = await prisma.taxonomySuggestion.findUnique({ where: { id: suggestionId } });
  if (!row || row.status !== TaxonomySuggestionStatus.PENDING) return { ok: false };

  await prisma.taxonomySuggestion.update({
    where: { id: suggestionId },
    data: { status: TaxonomySuggestionStatus.REJECTED, resolvedAt: new Date() },
  });

  revalidateTaxonomyPaths(row.kind);
  return { ok: true };
}

export async function acceptAllTaxonomySuggestions(
  kind: TaxonomySuggestionKind,
  options?: { createMissing?: boolean }
): Promise<{ ok: boolean; accepted: number; failed: number; created: number; assigned: number }> {
  await requireAdmin();
  const createMissing = options?.createMissing ?? true;

  const pending = await prisma.taxonomySuggestion.findMany({
    where: { kind, status: TaxonomySuggestionStatus.PENDING },
    orderBy: { createdAt: "asc" },
  });

  let accepted = 0;
  let failed = 0;
  let created = 0;
  let assigned = 0;

  for (const row of pending) {
    const hadTarget = Boolean(row.targetId);
    const r = await acceptTaxonomySuggestion(row.id, { createIfMissing: createMissing });
    if (r.ok) {
      accepted++;
      if (hadTarget) assigned++;
      else created++;
    } else {
      failed++;
    }
  }

  revalidateTaxonomyPaths(kind);
  return { ok: true, accepted, failed, created, assigned };
}

/**
 * Genera y aplica categorías/familias para TODOS los productos sin asignar.
 * Procesa en mini-lotes de 15 productos por llamada OpenAI, refrescando el catálogo
 * entre lotes para maximizar la reutilización de categorías existentes.
 */
export async function generateAndApplyTaxonomySuggestions(
  kind: TaxonomySuggestionKind
): Promise<{
  ok: boolean;
  generated: number;
  applied: number;
  newTaxonomies: number;
  assignedExisting: number;
  failed: number;
  error?: string;
}> {
  await requireAdmin();

  const field = kind === "CATEGORY" ? "categoryId" : "familyId";
  let totalApplied = 0;
  let totalNew = 0;
  let totalAssigned = 0;
  let totalFailed = 0;

  while (true) {
    const products = await prisma.product.findMany({
      where: { isActive: true, [field]: null },
      orderBy: { updatedAt: "desc" },
      take: MINI_BATCH,
      select: { id: true, normalizedName: true, internalSku: true, shortDescription: true },
    });

    if (products.length === 0) break;

    // Snapshot del catálogo actual (se refresca en cada iteración)
    const taxonomyCatalog =
      kind === "CATEGORY"
        ? (await prisma.category.findMany({ select: { name: true } })).map((c) => c.name)
        : (await prisma.productFamily.findMany({ select: { name: true } })).map((f) => f.name);

    const batchResults = await suggestTaxonomyAssignmentBatch({
      kind,
      products: products.map((p) => ({ id: p.id, name: p.normalizedName, sku: p.internalSku, description: p.shortDescription })),
      taxonomyCatalog,
    });

    for (const result of batchResults) {
      if (!result.name) { totalFailed++; continue; }

      let resolvedId = result.action === "existing" ? await resolveTargetId(kind, result.name) : null;

      if (!resolvedId) {
        if (kind === "CATEGORY") {
          const existing = await prisma.category.findFirst({ where: { name: { equals: result.name, mode: "insensitive" } } });
          if (existing) {
            resolvedId = existing.id;
          } else {
            const created = await prisma.category.create({ data: { name: result.name, slug: slugify(result.name) } });
            resolvedId = created.id;
            totalNew++;
          }
        } else {
          const existing = await prisma.productFamily.findFirst({ where: { name: { equals: result.name, mode: "insensitive" } } });
          if (existing) {
            resolvedId = existing.id;
          } else {
            const created = await prisma.productFamily.create({ data: { name: result.name, slug: slugify(result.name), isActive: true } });
            resolvedId = created.id;
            totalNew++;
          }
        }
      } else {
        totalAssigned++;
      }

      if (resolvedId) {
        if (kind === "CATEGORY") {
          await prisma.product.update({ where: { id: result.id }, data: { categoryId: resolvedId } });
        } else {
          await prisma.product.update({ where: { id: result.id }, data: { familyId: resolvedId } });
        }
        totalApplied++;
      } else {
        totalFailed++;
      }
    }

    revalidateTaxonomyPaths(kind);
  }

  return {
    ok: true,
    generated: totalApplied + totalFailed,
    applied: totalApplied,
    newTaxonomies: totalNew,
    assignedExisting: totalAssigned,
    failed: totalFailed,
    error: totalApplied === 0 && totalFailed === 0 ? "No hay productos sin asignar." : undefined,
  };
}
