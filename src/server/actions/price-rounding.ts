"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireStaff } from "@/lib/auth-helpers";
import { setSetting } from "@/lib/settings";
import {
  ROUNDING_DRAFT_SETTING_KEY,
  ROUNDING_SETTING_KEY,
  parseRoundingSetting,
  validateRoundingConfig,
  type PriceRoundingConfig,
} from "@/lib/price-rounding";
import { proposePriceReview } from "@/server/price-review/reviews";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function sameConfig(a: PriceRoundingConfig | null, b: PriceRoundingConfig | null): boolean {
  const norm = (c: PriceRoundingConfig | null) => (c?.enabled ? JSON.stringify({ mode: c.mode, tiers: c.tiers }) : "off");
  return norm(a) === norm(b);
}

/** Guarda los tramos como borrador. No mueve ningún precio. */
export async function saveRoundingDraftAction(input: PriceRoundingConfig): Promise<Result> {
  await requirePermission("settings.manage");
  const valid = validateRoundingConfig(input);
  if (!valid.ok) return valid;
  await setSetting(ROUNDING_DRAFT_SETTING_KEY, JSON.stringify(valid.config), {
    description: "Borrador del redondeo por tramos (no se aplica hasta aprobar la revisión).",
  });
  revalidatePath("/admin/settings/pricing");
  return { ok: true };
}

/**
 * Manda el redondeo (activar, desactivar o cambiar tramos) a Revisión de
 * cambios de precio: se simula con la lista de productos que se mueven y
 * recién se aplica cuando alguien con permiso de precios lo aprueba.
 */
export async function proposeRoundingAction(input: PriceRoundingConfig): Promise<Result<{ reviewId: string; affectedProducts: number }>> {
  await requirePermission("settings.manage");
  const { user } = await requireStaff(["margins.manage", "discounts.manage"], { costs: true });
  const valid = validateRoundingConfig(input);
  if (!valid.ok) return valid;
  const config = valid.config;
  await setSetting(ROUNDING_DRAFT_SETTING_KEY, JSON.stringify(config));

  const activeRow = await prisma.adminSetting.findUnique({ where: { key: ROUNDING_SETTING_KEY }, select: { value: true } });
  if (sameConfig(parseRoundingSetting(activeRow?.value), config)) {
    return { ok: false, error: config.enabled ? "Esos tramos ya son los vigentes." : "El redondeo ya está desactivado." };
  }

  const title = config.enabled
    ? `Redondeo de precios ${config.mode === "up" ? "hacia arriba" : "al más cercano"}: ${config.tiers.length} tramos`
    : "Desactivar el redondeo de precios";
  try {
    const review = await proposePriceReview({ type: "pricing.rounding", config }, title, { id: user.id, name: user.name ?? user.email ?? null });
    revalidatePath("/admin/price-reviews");
    revalidatePath("/admin/settings/pricing");
    return { ok: true, reviewId: review.id, affectedProducts: review.affectedProducts };
  } catch (err) {
    console.error("proposeRoundingAction", err);
    return { ok: false, error: "No se pudo simular el redondeo. Probá de nuevo." };
  }
}
