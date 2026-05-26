"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { slugify } from "@/lib/utils";
import { suggestTaxonomyAssignment } from "@/services/openai";
import { TaxonomySuggestionKind, TaxonomySuggestionStatus } from "@prisma/client";

const BATCH_LIMIT = 50;

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

/** Analiza productos sin categoría/familia y genera sugerencias (asignar existente o crear nueva). */
export async function generateTaxonomySuggestions(
  kind: TaxonomySuggestionKind
): Promise<{ ok: boolean; created: number; skipped: number; error?: string }> {
  await requireAdmin();

  const field = kind === "CATEGORY" ? "categoryId" : "familyId";
  const products = await prisma.product.findMany({
    where: { isActive: true, [field]: null },
    orderBy: { updatedAt: "desc" },
    take: BATCH_LIMIT,
    select: {
      id: true,
      normalizedName: true,
      internalSku: true,
      shortDescription: true,
    },
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

  const taxonomyCatalog =
    kind === "CATEGORY"
      ? (await prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true } })).map((c) => c.name)
      : (await prisma.productFamily.findMany({ orderBy: { name: "asc" }, select: { name: true } })).map((f) => f.name);

  let created = 0;
  let skipped = 0;

  for (const p of products) {
    if (pendingProductIds.has(p.id)) {
      skipped++;
      continue;
    }

    const assignment = await suggestTaxonomyAssignment({
      kind,
      productName: p.normalizedName,
      productSku: p.internalSku,
      shortDescription: p.shortDescription,
      taxonomyCatalog,
    });

    if (!assignment.name) {
      skipped++;
      continue;
    }

    const targetId =
      assignment.action === "existing" ? await resolveTargetId(kind, assignment.name) : null;

    await prisma.taxonomySuggestion.create({
      data: {
        kind,
        productId: p.id,
        suggestedName: assignment.name,
        targetId,
        confidence: assignment.confidence,
        rationale: assignment.rationale,
      },
    });
    created++;
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

/** Confirma sugerencias pendientes. Por defecto crea categorías/familias nuevas si hace falta. */
export async function acceptAllTaxonomySuggestions(
  kind: TaxonomySuggestionKind,
  options?: { createMissing?: boolean }
): Promise<{ ok: boolean; accepted: number; failed: number; created: number; assigned: number }> {
  await requireAdmin();
  const createMissing = options?.createMissing ?? true;

  const pending = await prisma.taxonomySuggestion.findMany({
    where: { kind, status: TaxonomySuggestionStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: 100,
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

/** Genera sugerencias con IA y las aplica en un solo paso (hasta BATCH_LIMIT productos). */
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
  const gen = await generateTaxonomySuggestions(kind);
  if (!gen.ok) return { ok: false, generated: 0, applied: 0, newTaxonomies: 0, assignedExisting: 0, failed: 0, error: gen.error };

  const apply = await acceptAllTaxonomySuggestions(kind, { createMissing: true });

  return {
    ok: true,
    generated: gen.created,
    applied: apply.accepted,
    newTaxonomies: apply.created,
    assignedExisting: apply.assigned,
    failed: apply.failed,
    error:
      gen.created === 0
        ? gen.error || "No se generaron sugerencias para aplicar."
        : undefined,
  };
}
