"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { RuleScopeType } from "@prisma/client";
import { badgeLabel, isManufacturerPromoLabel } from "@/lib/manufacturer-promo";
import {
  autoPriority,
  autoRuleName,
  markupToMarginPercent,
  resolveRuleScope,
  type RuleTarget,
} from "@/lib/pricing-scope";

function revalidatePricing() {
  revalidatePath("/admin/discounts");
  revalidatePath("/admin/margins");
  revalidatePath("/admin/products");
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/admin/visibility");
  revalidatePath("/portal/products");
}

const ruleSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  audience: z.enum(["all", "client"]).optional(),
  target: z.enum(["ALL", "BRAND", "PRODUCT", "CATEGORY", "FAMILY", "DISTRIBUTOR"]).optional(),
  scopeType: z.nativeEnum(RuleScopeType).optional(),
  scopeId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  percent: z.coerce.number().min(-100).max(1000),
  pricingMode: z.enum(["margin", "markup"]).optional(),
  isActive: z.coerce.boolean().optional(),
});

function parseRule(formData: FormData, kind: "margin" | "discount") {
  const parsed = ruleSchema.safeParse({
    name: formData.get("name") || "",
    audience: formData.get("audience") || undefined,
    target: formData.get("target") || undefined,
    scopeType: formData.get("scopeType") || undefined,
    scopeId: formData.get("scopeId") || null,
    clientId: formData.get("clientId") || null,
    percent: formData.get("percent"),
    pricingMode: formData.get("pricingMode") || "margin",
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Revisá a quién aplica y el valor." };
  }

  let scopeType: RuleScopeType;
  let clientId: string | null;
  let scopeId: string | null;

  if (parsed.data.audience && parsed.data.target) {
    const resolved = resolveRuleScope({
      audience: parsed.data.audience,
      target: parsed.data.target as RuleTarget,
      clientId: parsed.data.clientId,
      scopeId: parsed.data.scopeId,
    });
    if (!resolved.ok) return resolved;
    scopeType = resolved.scopeType;
    clientId = resolved.clientId;
    scopeId = resolved.scopeId;
  } else if (parsed.data.scopeType) {
    scopeType = parsed.data.scopeType;
    clientId = parsed.data.clientId || null;
    scopeId = parsed.data.scopeId || null;
    if (scopeType === "GLOBAL" && clientId) scopeType = "CLIENT";
    if (scopeType === "CLIENT" && !clientId) {
      return { ok: false as const, error: "Elegí un cliente." };
    }
  } else {
    return { ok: false as const, error: "Indicá a quién aplica la regla." };
  }

  const mode = parsed.data.pricingMode === "markup" ? "markup" : "margin";
  let marginPercent = parsed.data.percent;
  let markupMultiplier: number | null = null;
  if (kind === "margin" && mode === "markup") {
    if (parsed.data.percent <= 0 || parsed.data.percent > 20) {
      return { ok: false as const, error: "El markup tiene que ser un multiplicador (ej. 1.35)." };
    }
    markupMultiplier = parsed.data.percent;
    marginPercent = markupToMarginPercent(parsed.data.percent);
  } else if (kind === "margin") {
    markupMultiplier = null;
    marginPercent = parsed.data.percent;
  }

  const name =
    (parsed.data.name || "").trim() ||
    autoRuleName({
      kind,
      mode,
      value: parsed.data.percent,
      audience: clientId ? "client" : "all",
      target: (parsed.data.target as RuleTarget) || (scopeType === "GLOBAL" || scopeType === "CLIENT" ? "ALL" : (scopeType as RuleTarget)),
    });

  return {
    ok: true as const,
    data: {
      name,
      priority: autoPriority(scopeType, Boolean(clientId)),
      scopeType,
      scopeId,
      clientId,
      productId: scopeType === "PRODUCT" ? scopeId : null,
      percent: marginPercent,
      markupMultiplier,
      isActive: parsed.data.isActive ?? true,
    },
  };
}

export async function upsertMarginRule(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = parseRule(formData, "margin");
  if (!parsed.ok) return parsed;

  const data = {
    name: parsed.data.name,
    priority: parsed.data.priority,
    scopeType: parsed.data.scopeType,
    scopeId: parsed.data.scopeId,
    clientId: parsed.data.clientId,
    productId: parsed.data.productId,
    marginPercent: parsed.data.percent,
    markupMultiplier: parsed.data.markupMultiplier,
    isActive: parsed.data.isActive,
  };

  if (id) {
    await prisma.marginRule.update({ where: { id }, data });
  } else {
    await prisma.marginRule.create({ data });
  }
  revalidatePricing();
  return { ok: true };
}

export async function deleteMarginRule(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.marginRule.delete({ where: { id } });
  revalidatePricing();
}

export async function upsertDiscountRule(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = parseRule(formData, "discount");
  if (!parsed.ok) return parsed;

  const data = {
    name: parsed.data.name,
    priority: parsed.data.priority,
    scopeType: parsed.data.scopeType,
    scopeId: parsed.data.scopeId,
    clientId: parsed.data.clientId,
    productId: parsed.data.productId,
    discountPercent: parsed.data.percent,
    isActive: parsed.data.isActive,
  };

  if (id) {
    await prisma.discountRule.update({ where: { id }, data });
  } else {
    await prisma.discountRule.create({ data });
  }
  revalidatePricing();
  return { ok: true };
}

export async function deleteDiscountRule(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.discountRule.delete({ where: { id } });
  revalidatePricing();
}

export async function clearProductDiscount(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("productId") || "");
  if (!id) return;
  await prisma.product.update({
    where: { id },
    data: { discountPercent: null },
  });
  revalidatePricing();
  revalidatePath(`/admin/products/${id}`);
  revalidatePath(`/portal/products/${id}`);
}

export async function clearAllProductDiscounts(): Promise<{ ok: boolean; count: number }> {
  await requireAdmin();
  const result = await prisma.product.updateMany({
    where: { discountPercent: { gt: 0 } },
    data: { discountPercent: null },
  });
  revalidatePricing();
  return { ok: true, count: result.count };
}

export async function clearManufacturerPromo(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("productId") || "");
  if (!id) return;
  const product = await prisma.product.findUnique({
    where: { id },
    select: { badges: true },
  });
  if (!product) return;
  await prisma.product.update({
    where: { id },
    data: {
      salePriceLabel: null,
      salePriceUsd: null,
      salePriceStartsAt: null,
      salePriceEndsAt: null,
      ...(Array.isArray(product.badges)
        ? { badges: product.badges.filter((badge) => !isManufacturerPromoLabel(badgeLabel(badge))) }
        : {}),
    },
  });
  revalidatePricing();
  revalidatePath(`/admin/products/${id}`);
  revalidatePath(`/portal/products/${id}`);
}

export async function clearAllManufacturerPromos(): Promise<{ ok: boolean; count: number }> {
  await requireAdmin();
  const products = await prisma.product.findMany({
    where: {
      OR: [{ salePriceLabel: { not: null } }, { salePriceUsd: { gt: 0 } }],
    },
    select: { id: true, badges: true },
  });
  for (const product of products) {
    const nextBadges = Array.isArray(product.badges)
      ? product.badges.filter((badge) => !isManufacturerPromoLabel(badgeLabel(badge)))
      : undefined;
    await prisma.product.update({
      where: { id: product.id },
      data: {
        salePriceLabel: null,
        salePriceUsd: null,
        salePriceStartsAt: null,
        salePriceEndsAt: null,
        ...(nextBadges ? { badges: nextBadges } : {}),
      },
    });
  }
  revalidatePricing();
  return { ok: true, count: products.length };
}


const visibilitySchema = z.object({
  clientId: z.string().min(1),
  scopeType: z.nativeEnum(RuleScopeType),
  scopeIds: z.array(z.string().min(1)).min(1),
  canView: z.coerce.boolean().default(false),
});

/**
 * Crea o actualiza reglas de visibilidad para varios recursos a la vez.
 * Acepta múltiples scopeIds para que el admin pueda ocultar/permitir varias
 * marcas, categorías, etc., en una sola operación.
 */
export async function upsertVisibility(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const rawIds = formData.getAll("scopeIds").map((v) => String(v)).filter(Boolean);
  // Compat con el campo viejo `scopeId` (single-select).
  const legacyId = String(formData.get("scopeId") || "");
  const scopeIds = rawIds.length > 0 ? rawIds : legacyId ? [legacyId] : [];

  const parsed = visibilitySchema.safeParse({
    clientId: formData.get("clientId"),
    scopeType: formData.get("scopeType"),
    scopeIds,
    canView: formData.get("canView") === "on" || formData.get("canView") === "true",
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisá el cliente y los recursos." };
  }

  if (id) {
    const scopeId = parsed.data.scopeIds[0] || null;
    await prisma.visibilityRule.update({
      where: { id },
      data: {
        clientId: parsed.data.clientId,
        scopeType: parsed.data.scopeType,
        scopeId,
        canView: parsed.data.canView,
        productId: parsed.data.scopeType === "PRODUCT" ? scopeId : null,
      },
    });
  } else {
    for (const scopeId of parsed.data.scopeIds) {
      const existing = await prisma.visibilityRule.findFirst({
        where: {
          clientId: parsed.data.clientId,
          scopeType: parsed.data.scopeType,
          scopeId,
        },
      });
      if (existing) {
        await prisma.visibilityRule.update({
          where: { id: existing.id },
          data: { canView: parsed.data.canView },
        });
      } else {
        await prisma.visibilityRule.create({
          data: {
            clientId: parsed.data.clientId,
            scopeType: parsed.data.scopeType,
            scopeId,
            canView: parsed.data.canView,
            productId: parsed.data.scopeType === "PRODUCT" ? scopeId : null,
          },
        });
      }
    }
  }
  revalidatePath("/admin/visibility");
  revalidatePath("/admin/clients", "layout");
  revalidatePath(`/admin/users/${parsed.data.clientId}`);
  revalidatePath("/portal/products");
  return { ok: true };
}

export async function toggleVisibilityCanView(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const rule = await prisma.visibilityRule.findUnique({ where: { id }, select: { canView: true } });
  if (!rule) return;
  await prisma.visibilityRule.update({
    where: { id },
    data: { canView: !rule.canView },
  });
  revalidatePath("/admin/visibility");
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/portal/products");
}

export async function deleteVisibility(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.visibilityRule.delete({ where: { id } });
  revalidatePath("/admin/visibility");
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/portal/products");
}
