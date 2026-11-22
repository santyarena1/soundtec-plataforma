"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import type { PermissionScope } from "@/lib/permissions";
import {
  applyPriceReview,
  discardPriceReview,
  refreshPriceReview,
  type ProposedReview,
} from "@/server/price-review/reviews";
import { revalidatePriceViews } from "@/server/price-review/revalidate";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Quién puede decidir cada revisión: el permiso del área que cambia (con acceso a costos). */
function scopesFor(area: string): PermissionScope[] {
  if (area === "MARGIN") return ["margins.manage"];
  if (area === "DISCOUNT") return ["discounts.manage"];
  return ["margins.manage", "discounts.manage"];
}

async function guardReview(id: string) {
  const review = await prisma.priceReview.findUnique({ where: { id }, select: { area: true } });
  if (!review) return null;
  const { user } = await requireStaff(scopesFor(review.area), { costs: true });
  return { actor: { id: user.id, name: user.name ?? user.email ?? null } };
}

function message(err: unknown, fallback: string) {
  return err instanceof Error && err.message && !/prisma|invocation|P\d{4}/i.test(err.message) ? err.message : fallback;
}

export async function applyPriceReviewAction(id: string): Promise<Result<{ affectedProducts: number; simulated: number }>> {
  const guard = await guardReview(id);
  if (!guard) return { ok: false, error: "La revisión no existe." };
  try {
    const result = await applyPriceReview(id, guard.actor);
    revalidatePriceViews();
    return { ok: true, ...result };
  } catch (err) {
    console.error("applyPriceReviewAction", err);
    return { ok: false, error: message(err, "No se pudo aplicar. Probá de nuevo.") };
  }
}

export async function discardPriceReviewAction(id: string): Promise<Result> {
  const guard = await guardReview(id);
  if (!guard) return { ok: false, error: "La revisión no existe." };
  try {
    await discardPriceReview(id, guard.actor);
    revalidatePath("/admin/price-reviews");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: message(err, "No se pudo descartar.") };
  }
}

export async function refreshPriceReviewAction(id: string): Promise<Result<{ review: ProposedReview }>> {
  const guard = await guardReview(id);
  if (!guard) return { ok: false, error: "La revisión no existe." };
  try {
    const review = await refreshPriceReview(id);
    revalidatePath("/admin/price-reviews");
    return { ok: true, review };
  } catch (err) {
    console.error("refreshPriceReviewAction", err);
    return { ok: false, error: message(err, "No se pudo recalcular.") };
  }
}
