"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { RuleScopeType } from "@prisma/client";

const commercialSchema = z.object({
  clientId: z.string().min(1),
  assignedPriceListId: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export async function saveClientCommercialConfig(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = commercialSchema.safeParse({
    clientId: formData.get("clientId"),
    assignedPriceListId: formData.get("assignedPriceListId") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return;

  await prisma.client.update({
    where: { id: parsed.data.clientId },
    data: {
      assignedPriceListId: parsed.data.assignedPriceListId || null,
      notes: parsed.data.notes || null,
    },
  });

  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
  revalidatePath("/admin/clients");
}

const movementSchema = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["DEBIT", "CREDIT"]),
  concept: z.string().min(2).max(200),
  amountUsd: z.coerce.number().positive(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export async function createClientAccountMovement(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = movementSchema.safeParse({
    clientId: formData.get("clientId"),
    kind: formData.get("kind"),
    concept: formData.get("concept"),
    amountUsd: formData.get("amountUsd"),
    dueDate: formData.get("dueDate") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return;

  await prisma.accountMovement.create({
    data: {
      clientId: parsed.data.clientId,
      kind: parsed.data.kind,
      concept: parsed.data.concept,
      amountUsd: parsed.data.amountUsd,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      notes: parsed.data.notes || null,
    },
  });
  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
}

export async function toggleClientMovementPaid(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const clientId = String(formData.get("clientId") || "");
  if (!id || !clientId) return;
  const row = await prisma.accountMovement.findUnique({ where: { id } });
  if (!row) return;
  await prisma.accountMovement.update({
    where: { id },
    data: { paidAt: row.paidAt ? null : new Date() },
  });
  revalidatePath(`/admin/clients/${clientId}`);
}

export async function deleteClientVisibility(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const clientId = String(formData.get("clientId") || "");
  if (!id) return;
  await prisma.visibilityRule.delete({ where: { id } });
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/visibility");
}

const discountSchema = z.object({
  clientId: z.string().min(1),
  scopeType: z.enum(["GLOBAL", "BRAND", "CATEGORY", "PRODUCT"]),
  scopeId: z.string().optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100),
  priority: z.coerce.number().int().min(0).max(10000).default(20),
  name: z.string().min(2).max(200),
});

export async function upsertClientExtraDiscount(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = discountSchema.safeParse({
    clientId: formData.get("clientId"),
    scopeType: formData.get("scopeType"),
    scopeId: formData.get("scopeId") || null,
    discountPercent: formData.get("discountPercent"),
    priority: formData.get("priority") || 20,
    name: formData.get("name"),
  });
  if (!parsed.success) return;

  const scopeType =
    parsed.data.scopeType === "GLOBAL" ? RuleScopeType.CLIENT : (parsed.data.scopeType as RuleScopeType);
  const scopeId = parsed.data.scopeId || null;

  const existing = await prisma.discountRule.findFirst({
    where: {
      clientId: parsed.data.clientId,
      scopeId,
      OR: [{ scopeType }, { scopeType: "GLOBAL" }],
    },
  });
  const data = {
    name: parsed.data.name,
    priority: parsed.data.priority,
    scopeType,
    scopeId,
    clientId: parsed.data.clientId,
    productId: parsed.data.scopeType === "PRODUCT" ? scopeId : null,
    discountPercent: parsed.data.discountPercent,
    isActive: true,
  };
  if (existing) {
    await prisma.discountRule.update({ where: { id: existing.id }, data });
  } else {
    await prisma.discountRule.create({ data });
  }
  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
  revalidatePath("/admin/discounts");
  revalidatePath("/portal/products");
}

export async function deleteClientExtraDiscount(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const clientId = String(formData.get("clientId") || "");
  if (!id) return;
  await prisma.discountRule.delete({ where: { id } });
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/discounts");
  revalidatePath("/portal/products");
}
