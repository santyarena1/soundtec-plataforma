"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { RuleScopeType } from "@prisma/client";

const ruleSchema = z.object({
  name: z.string().min(2).max(200),
  priority: z.coerce.number().int().min(0).max(10000).default(100),
  scopeType: z.nativeEnum(RuleScopeType),
  scopeId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  percent: z.coerce.number().min(-100).max(1000),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertMarginRule(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = ruleSchema.safeParse({
    name: formData.get("name"),
    priority: formData.get("priority") || 100,
    scopeType: formData.get("scopeType"),
    scopeId: formData.get("scopeId") || null,
    clientId: formData.get("clientId") || null,
    percent: formData.get("percent"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;

  const data = {
    name: parsed.data.name,
    priority: parsed.data.priority,
    scopeType: parsed.data.scopeType,
    scopeId: parsed.data.scopeId || null,
    clientId: parsed.data.clientId || null,
    productId: parsed.data.scopeType === "PRODUCT" ? parsed.data.scopeId || null : null,
    marginPercent: parsed.data.percent,
    isActive: parsed.data.isActive ?? true,
  };

  if (id) {
    await prisma.marginRule.update({ where: { id }, data });
  } else {
    await prisma.marginRule.create({ data });
  }
  revalidatePath("/admin/margins");
}

export async function deleteMarginRule(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.marginRule.delete({ where: { id } });
  revalidatePath("/admin/margins");
}

export async function upsertDiscountRule(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = ruleSchema.safeParse({
    name: formData.get("name"),
    priority: formData.get("priority") || 100,
    scopeType: formData.get("scopeType"),
    scopeId: formData.get("scopeId") || null,
    clientId: formData.get("clientId") || null,
    percent: formData.get("percent"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;

  const data = {
    name: parsed.data.name,
    priority: parsed.data.priority,
    scopeType: parsed.data.scopeType,
    scopeId: parsed.data.scopeId || null,
    clientId: parsed.data.clientId || null,
    productId: parsed.data.scopeType === "PRODUCT" ? parsed.data.scopeId || null : null,
    discountPercent: parsed.data.percent,
    isActive: parsed.data.isActive ?? true,
  };

  if (id) {
    await prisma.discountRule.update({ where: { id }, data });
  } else {
    await prisma.discountRule.create({ data });
  }
  revalidatePath("/admin/discounts");
}

export async function deleteDiscountRule(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.discountRule.delete({ where: { id } });
  revalidatePath("/admin/discounts");
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
