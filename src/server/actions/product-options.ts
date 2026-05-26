"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

const upsertSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(2).max(120),
  type: z.enum(["select", "boolean", "number", "text"]).default("select"),
  values: z.string().max(2000).optional().nullable(),
  priceDeltaUsd: z.coerce.number().optional().nullable(),
  isRequired: z.coerce.boolean().optional(),
});

export async function upsertProductOption(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = upsertSchema.safeParse({
    productId: formData.get("productId"),
    name: formData.get("name"),
    type: formData.get("type") || "select",
    values: formData.get("values") || null,
    priceDeltaUsd: formData.get("priceDeltaUsd") || null,
    isRequired: formData.get("isRequired") === "on" || formData.get("isRequired") === "true",
  });
  if (!parsed.success) return;

  const values = parsed.data.values
    ? parsed.data.values.split(/[\n,;]/).map((v) => v.trim()).filter(Boolean)
    : [];

  const data = {
    productId: parsed.data.productId,
    name: parsed.data.name,
    type: parsed.data.type,
    values: values as unknown as object,
    priceDeltaUsd: parsed.data.priceDeltaUsd ?? null,
    isRequired: parsed.data.isRequired ?? false,
  };

  if (id) {
    await prisma.productOption.update({ where: { id }, data });
  } else {
    await prisma.productOption.create({ data });
  }
  await prisma.product.update({
    where: { id: parsed.data.productId },
    data: { isCustomizable: true },
  });
  revalidatePath(`/admin/products/${parsed.data.productId}`);
  revalidatePath(`/portal/products/${parsed.data.productId}`);
}

export async function deleteProductOption(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const productId = String(formData.get("productId") || "");
  if (!id) return;
  await prisma.productOption.delete({ where: { id } });
  const remaining = await prisma.productOption.count({ where: { productId } });
  if (remaining === 0 && productId) {
    await prisma.product.update({ where: { id: productId }, data: { isCustomizable: false } });
  }
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/portal/products/${productId}`);
}
