"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

const accessorySchema = z.object({
  productId: z.string().min(1),
  accessoryProductId: z.string().min(1),
  isRequired: z.coerce.boolean().optional(),
});

export async function upsertAccessoryRelation(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = accessorySchema.safeParse({
    productId: formData.get("productId"),
    accessoryProductId: formData.get("accessoryProductId"),
    isRequired: formData.get("isRequired") === "on" || formData.get("isRequired") === "true",
  });
  if (!parsed.success) return;
  if (parsed.data.productId === parsed.data.accessoryProductId) return;

  await prisma.$transaction([
    prisma.accessoryRelation.upsert({
      where: {
        productId_accessoryProductId: {
          productId: parsed.data.productId,
          accessoryProductId: parsed.data.accessoryProductId,
        },
      },
      update: { isRequired: parsed.data.isRequired ?? false },
      create: {
        productId: parsed.data.productId,
        accessoryProductId: parsed.data.accessoryProductId,
        isRequired: parsed.data.isRequired ?? false,
      },
    }),
    // El accesorio pasa a tipo ACCESORIO.
    prisma.product.update({
      where: { id: parsed.data.accessoryProductId },
      data: { kind: "ACCESORIO" },
    }),
    // El producto principal se marca como configurable.
    prisma.product.update({
      where: { id: parsed.data.productId },
      data: { isCustomizable: true },
    }),
  ]);

  revalidatePath(`/admin/products/${parsed.data.productId}`);
  revalidatePath(`/admin/products/${parsed.data.accessoryProductId}`);
}

export async function deleteAccessoryRelation(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const productId = String(formData.get("productId") || "");
  if (!id) return;
  await prisma.accessoryRelation.delete({ where: { id } });
  revalidatePath(`/admin/products/${productId}`);
}
