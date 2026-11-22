/**
 * Mover productos de rubro. Si hay reglas de precio por rubro, mover puede
 * cambiar precios: se simula y, si alguno cambia, queda en «Revisión de
 * cambios» en vez de aplicarse. Si no cambia nada se aplica y queda registrado.
 * Sin reglas por rubro no hay nada que revisar y se mueve directo.
 */
import { prisma } from "@/lib/prisma";
import { validateRubroIds } from "@/server/categories/rubros";
import { applyAndRecord, proposePriceReview, type ReviewActor } from "@/server/price-review/reviews";
import { simulateOperation } from "@/server/price-review/engine";
import type { PriceOperation } from "@/lib/price-review/operations";

export type MoveResult =
  | { ok: true; applied: true; moved: number }
  | { ok: true; applied: false; reviewId: string; affectedProducts: number }
  | { ok: false; error: string };

/** ¿Hay alguna regla de margen o descuento por rubro activa? */
export async function hasCategoryPriceRules(): Promise<boolean> {
  const [margins, discounts] = await Promise.all([
    prisma.marginRule.count({ where: { scopeType: "CATEGORY", isActive: true } }),
    prisma.discountRule.count({ where: { scopeType: "CATEGORY", isActive: true } }),
  ]);
  return margins + discounts > 0;
}

export async function moveProductsToRubro(
  productIds: string[],
  categoryId: string,
  actor: ReviewActor,
  title: string
): Promise<MoveResult> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return { ok: true, applied: true, moved: 0 };
  const valid = await validateRubroIds(prisma, [categoryId]);
  if (!valid.ok) return valid;
  const op: PriceOperation = { type: "products.setCategory", productIds: ids, categoryId };
  if (!(await hasCategoryPriceRules())) {
    const updated = await prisma.product.updateMany({ where: { id: { in: ids } }, data: { categoryId } });
    return { ok: true, applied: true, moved: updated.count };
  }
  const simulated = await simulateOperation(op);
  if (simulated.summary.affectedProducts === 0) {
    await applyAndRecord(op, title, actor);
    return { ok: true, applied: true, moved: ids.length };
  }
  const review = await proposePriceReview(op, title, actor);
  return { ok: true, applied: false, reviewId: review.id, affectedProducts: review.affectedProducts };
}

/** Texto para el usuario cuando el movimiento quedó en revisión. */
export function moveReviewMessage(result: Extract<MoveResult, { applied: false }>): string {
  return `El cambio de rubro mueve el precio de ${result.affectedProducts} producto${result.affectedProducts === 1 ? "" : "s"} (hay reglas por rubro): quedó en Precios › Revisión de cambios y se aplica desde ahí.`;
}
