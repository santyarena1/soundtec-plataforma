/**
 * Revisiones de cambios de precio: crear (simulando), aplicar, descartar y
 * recalcular. Las acciones de servidor chequean permisos antes de llamar acá.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { areaOf, isPriceOperation, type PriceOperation, type RuleKind } from "@/lib/price-review/operations";
import { orphanedByDeletion, ruleEditKey } from "@/lib/price-review/pending";
import { invalidateCoverageCache } from "@/server/pricing/coverage-cache";
import { commitOperation, simulateOperation, simulateOperationDetailed, type SimulationResult } from "@/server/price-review/engine";

export interface ReviewActor {
  id: string;
  name: string | null;
}

export interface ProposedReview {
  id: string;
  affectedProducts: number;
  affectedRows: number;
  up: number;
  down: number;
  /** true: ya había una revisión pendiente idéntica (doble clic, mismo cambio dos veces) y se devolvió esa. */
  reused?: boolean;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Una revisión pendiente con exactamente el mismo cambio (doble clic en
 * «Calcular impacto», el mismo borrado dos veces): se devuelve esa en vez de
 * crear otra igual.
 */
async function findIdenticalPending(op: PriceOperation): Promise<ProposedReview | null> {
  const existing = await prisma.priceReview.findFirst({
    where: { status: "PENDING", area: areaOf(op), operation: { equals: toJson(op) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, affectedProducts: true, affectedRows: true, summary: true },
  });
  if (!existing) return null;
  const summary = (existing.summary ?? {}) as { up?: number; down?: number };
  return {
    id: existing.id,
    affectedProducts: existing.affectedProducts,
    affectedRows: existing.affectedRows,
    up: summary.up ?? 0,
    down: summary.down ?? 0,
    reused: true,
  };
}

/**
 * Una edición nueva de una regla (o grupo) reemplaza a las ediciones pendientes
 * anteriores de esa misma regla: si no, aplicar la vieja después pisaba lo último.
 * Quedan descartadas y con la nota en «quién decidió».
 */
async function supersedeOlderEdits(op: PriceOperation, keepId: string, actor: ReviewActor): Promise<void> {
  const key = ruleEditKey(op);
  if (!key) return;
  const pending = await prisma.priceReview.findMany({
    where: { status: "PENDING", area: areaOf(op), id: { not: keepId } },
    select: { id: true, operation: true },
  });
  const older = pending.filter((row) => ruleEditKey(row.operation) === key).map((row) => row.id);
  if (!older.length) return;
  await prisma.priceReview.updateMany({
    where: { id: { in: older }, status: "PENDING" },
    data: {
      status: "DISCARDED",
      decidedById: actor.id,
      decidedByName: `${actor.name ?? "—"} (reemplazada por un cambio más nuevo de la misma regla)`.slice(0, 190),
      decidedAt: new Date(),
    },
  });
}

/** Simula el cambio y lo deja pendiente en «Revisión de cambios». No toca precios. */
export async function proposePriceReview(op: PriceOperation, title: string, actor: ReviewActor): Promise<ProposedReview> {
  const duplicate = await findIdenticalPending(op);
  if (duplicate) return duplicate;
  return createPendingReview(op, title, actor, await simulateOperation(op));
}

/**
 * Para altas y ediciones de reglas: si el cambio es SOLO de nombre (o nota) no
 * mueve precios, así que se guarda directo y queda registrado como aplicado.
 * Si no, queda pendiente en Revisión de cambios como siempre.
 */
export async function proposeOrApplyRename(
  op: PriceOperation,
  titles: { rename: string; review: string },
  actor: ReviewActor
): Promise<{ applied: true; unchanged?: boolean } | { applied: false; review: ProposedReview }> {
  const duplicate = await findIdenticalPending(op);
  if (duplicate) return { applied: false, review: duplicate };
  const { result, namesOnly, unchanged } = await simulateOperationDetailed(op);
  // Guardar sin tocar nada: no hay nada que revisar ni registrar.
  if (unchanged) return { applied: true, unchanged: true };
  if (namesOnly) {
    await applyAndRecord(op, titles.rename, actor);
    return { applied: true };
  }
  // Una edición de valor/alcance lleva el título de la edición (antes decía «Renombrar…» aunque cambiara el valor).
  return { applied: false, review: await createPendingReview(op, titles.review, actor, result) };
}

async function createPendingReview(op: PriceOperation, title: string, actor: ReviewActor, result: SimulationResult): Promise<ProposedReview> {
  const review = await prisma.priceReview.create({
    data: {
      area: areaOf(op),
      title: title.slice(0, 300),
      operation: toJson(op),
      affectedProducts: result.summary.affectedProducts,
      affectedRows: result.summary.affectedRows,
      totalBeforeUsd: result.summary.totalBeforeUsd,
      totalAfterUsd: result.summary.totalAfterUsd,
      summary: toJson(result.summary),
      items: toJson(result.rows),
      createdById: actor.id,
      createdByName: actor.name,
    },
    select: { id: true },
  });
  await supersedeOlderEdits(op, review.id, actor);
  return {
    id: review.id,
    affectedProducts: result.summary.affectedProducts,
    affectedRows: result.summary.affectedRows,
    up: result.summary.up,
    down: result.summary.down,
  };
}

/**
 * Aplica un cambio que se sabe sin impacto (o que no necesita aprobación) y lo
 * deja registrado como aplicado, con lo que se movió de verdad.
 */
export async function applyAndRecord(op: PriceOperation, title: string, actor: ReviewActor): Promise<SimulationResult> {
  const result = await commitOperation(op);
  invalidateCoverageCache();
  await prisma.priceReview.create({
    data: {
      status: "APPLIED",
      area: areaOf(op),
      title: title.slice(0, 300),
      operation: toJson(op),
      affectedProducts: result.summary.affectedProducts,
      affectedRows: result.summary.affectedRows,
      totalBeforeUsd: result.summary.totalBeforeUsd,
      totalAfterUsd: result.summary.totalAfterUsd,
      summary: toJson(result.summary),
      items: toJson(result.rows),
      appliedResult: toJson(result.summary),
      createdById: actor.id,
      createdByName: actor.name,
      decidedById: actor.id,
      decidedByName: actor.name,
      decidedAt: new Date(),
    },
  });
  return result;
}

async function loadPending(id: string) {
  const review = await prisma.priceReview.findUnique({ where: { id } });
  if (!review) throw new Error("La revisión no existe.");
  if (review.status !== "PENDING") throw new Error("Esta revisión ya se aplicó o se descartó.");
  if (!isPriceOperation(review.operation)) throw new Error("La revisión no tiene un cambio válido.");
  return { review, op: review.operation as PriceOperation };
}

/** Aplica una revisión pendiente. Vuelve a calcular en el momento: si algo cambió en el medio, queda anotado. */
export async function applyPriceReview(id: string, actor: ReviewActor): Promise<{ affectedProducts: number; simulated: number }> {
  const { review, op } = await loadPending(id);
  // Marca primero para que dos clics no lo apliquen dos veces.
  const claimed = await prisma.priceReview.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "APPLIED", decidedById: actor.id, decidedByName: actor.name, decidedAt: new Date() },
  });
  if (claimed.count === 0) throw new Error("Esta revisión ya se aplicó o se descartó.");
  try {
    const result = await commitOperation(op);
    invalidateCoverageCache();
    await prisma.priceReview.update({
      where: { id },
      data: { appliedResult: toJson({ ...result.summary, simulatedProducts: review.affectedProducts }), error: null },
    });
    if (op.type === "rules.delete") await discardOrphanedReviews(op.kind, op.ids, actor);
    return { affectedProducts: result.summary.affectedProducts, simulated: review.affectedProducts };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo aplicar.";
    await prisma.priceReview.update({
      where: { id },
      data: { status: "PENDING", decidedById: null, decidedByName: null, decidedAt: null, error: message.slice(0, 500) },
    });
    throw err;
  }
}

/** Revisiones pendientes que editaban o activaban reglas que se acaban de borrar: se descartan solas. */
async function discardOrphanedReviews(kind: RuleKind, ids: string[], actor: ReviewActor): Promise<void> {
  const deleted = new Set(ids);
  const pending = await prisma.priceReview.findMany({
    where: { status: "PENDING", area: kind === "margin" ? "MARGIN" : "DISCOUNT" },
    select: { id: true, operation: true },
  });
  const orphaned = pending.filter((row) => orphanedByDeletion(row.operation, kind, deleted)).map((row) => row.id);
  if (!orphaned.length) return;
  await prisma.priceReview.updateMany({
    where: { id: { in: orphaned }, status: "PENDING" },
    data: {
      status: "DISCARDED",
      decidedById: actor.id,
      decidedByName: `${actor.name ?? "—"} (la regla se borró)`.slice(0, 190),
      decidedAt: new Date(),
    },
  });
}

export async function discardPriceReview(id: string, actor: ReviewActor): Promise<void> {
  const updated = await prisma.priceReview.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "DISCARDED", decidedById: actor.id, decidedByName: actor.name, decidedAt: new Date() },
  });
  if (updated.count === 0) throw new Error("Esta revisión ya se aplicó o se descartó.");
}

/** Vuelve a simular una pendiente (si cambiaron costos o reglas desde que se creó). */
export async function refreshPriceReview(id: string): Promise<ProposedReview> {
  const { op } = await loadPending(id);
  const result = await simulateOperation(op);
  await prisma.priceReview.update({
    where: { id },
    data: {
      affectedProducts: result.summary.affectedProducts,
      affectedRows: result.summary.affectedRows,
      totalBeforeUsd: result.summary.totalBeforeUsd,
      totalAfterUsd: result.summary.totalAfterUsd,
      summary: toJson(result.summary),
      items: toJson(result.rows),
      error: null,
    },
  });
  return {
    id,
    affectedProducts: result.summary.affectedProducts,
    affectedRows: result.summary.affectedRows,
    up: result.summary.up,
    down: result.summary.down,
  };
}

export async function countPendingPriceReviews(areas?: string[]): Promise<number> {
  return prisma.priceReview.count({ where: { status: "PENDING", ...(areas ? { area: { in: areas } } : {}) } });
}
