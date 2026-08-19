"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { RuleScopeType } from "@prisma/client";
import { badgeLabel, isManufacturerPromoLabel } from "@/lib/manufacturer-promo";

const SCOPES_NEEDING_RESOURCE: RuleScopeType[] = [
  "BRAND",
  "DISTRIBUTOR",
  "CATEGORY",
  "FAMILY",
  "PRODUCT",
];

function revalidatePricing() {
  revalidatePath("/admin/discounts");
  revalidatePath("/admin/margins");
  revalidatePath("/admin/products");
  revalidatePath("/admin/clients");
  revalidatePath("/portal/products");
}

const ruleSchema = z.object({
  name: z.string().min(2).max(200),
  priority: z.coerce.number().int().min(0).max(10000).default(100),
  scopeType: z.nativeEnum(RuleScopeType),
  scopeId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  percent: z.coerce.number().min(-100).max(1000),
  isActive: z.coerce.boolean().optional(),
});

function parseRule(formData: FormData) {
  const parsed = ruleSchema.safeParse({
    name: formData.get("name"),
    priority: formData.get("priority") || 100,
    scopeType: formData.get("scopeType"),
    scopeId: formData.get("scopeId") || null,
    clientId: formData.get("clientId") || null,
    percent: formData.get("percent"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Revisá nombre, alcance y porcentaje." };
  }

  let scopeType = parsed.data.scopeType;
  const clientId = parsed.data.clientId || null;
  const scopeId = parsed.data.scopeId || null;

  // Global + cliente = descuento/margen de ese cliente, no una regla muerta.
  if (scopeType === "GLOBAL" && clientId) {
    scopeType = "CLIENT";
  }
  if (scopeType === "CLIENT" && !clientId) {
    return { ok: false as const, error: "Elegí un cliente para un alcance de cliente." };
  }
  if (SCOPES_NEEDING_RESOURCE.includes(scopeType) && !scopeId) {
    return { ok: false as const, error: "Elegí el recurso del alcance (marca, producto, etc.)." };
  }

  return {
    ok: true as const,
    data: {
      name: parsed.data.name,
      priority: parsed.data.priority,
      scopeType,
      scopeId: SCOPES_NEEDING_RESOURCE.includes(scopeType) ? scopeId : null,
      clientId,
      productId: scopeType === "PRODUCT" ? scopeId : null,
      percent: parsed.data.percent,
      isActive: parsed.data.isActive ?? true,
    },
  };
}

export async function upsertMarginRule(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = parseRule(formData);
  if (!parsed.ok) return parsed;

  const data = {
    name: parsed.data.name,
    priority: parsed.data.priority,
    scopeType: parsed.data.scopeType,
    scopeId: parsed.data.scopeId,
    clientId: parsed.data.clientId,
    productId: parsed.data.productId,
    marginPercent: parsed.data.percent,
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
  const parsed = parseRule(formData);
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
export async function upsertVisibility(formData: FormData): Promise<void> {
  await requireAdmin();
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
  if (!parsed.success) return;

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
  revalidatePath("/admin/visibility");
  revalidatePath(`/admin/users/${parsed.data.clientId}`);
}

export async function deleteVisibility(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.visibilityRule.delete({ where: { id } });
  revalidatePath("/admin/visibility");
}
