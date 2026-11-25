/**
 * Revisiones de cambios de precio: crear (simulando), aplicar, descartar y
 * recalcular. Las acciones de servidor chequean permisos antes de llamar acá.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { areaOf, isPriceOperation, type PriceOperation } from "@/lib/price-review/operations";
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
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Simula el cambio y lo deja pendiente en «Revisión de cambios». No toca precios. */
export async function proposePriceReview(op: PriceOperation, title: string, actor: ReviewActor): Promise<ProposedReview> {
  return createPendingReview(op, title, actor, await simulateOperation(op));
}

/**
 * Para altas y ediciones de reglas: si el cambio es SOLO de nombre (o nota) no
 * mueve precios, así que se guarda directo y queda registrado como aplicado.
 * Si no, queda pendiente en Revisión de cambios como siempre.
 */
export async function proposeOrApplyRename(
  op: PriceOperation,
  title: string,
  actor: ReviewActor
): Promise<{ applied: true } | { applied: false; review: ProposedReview }> {
  const { result, namesOnly } = await simulateOperationDetailed(op);
  if (namesOnly) {
    await applyAndRecord(op, title, actor);
    return { applied: true };
  }
  return { applied: false, review: await createPendingReview(op, title, actor, result) };
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
    await prisma.priceReview.update({
      where: { id },
      data: { appliedResult: toJson({ ...result.summary, simulatedProducts: review.affectedProducts }), error: null },
    });
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
