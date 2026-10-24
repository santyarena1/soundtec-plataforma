"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";

const labelSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
});

export async function upsertLabel(formData: FormData): Promise<void> {
  await requireStaff("brands.manage");
  const id = formData.get("id")?.toString() || undefined;
  const parsed = labelSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "#6366f1",
  });
  if (!parsed.success) return;

  if (id) {
    await prisma.label.update({ where: { id }, data: parsed.data });
  } else {
    await prisma.label.create({ data: parsed.data });
  }
  revalidatePath("/admin/labels");
  revalidatePath("/admin/products");
}

export async function deleteLabel(formData: FormData): Promise<void> {
  await requireStaff("brands.manage");
  const id = formData.get("id")?.toString();
  if (!id) return;
  await prisma.label.delete({ where: { id } });
  revalidatePath("/admin/labels");
  revalidatePath("/admin/products");
}

export async function setProductLabels(
  productId: string,
  labelIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff("products.edit");
  if (!productId) return { ok: false, error: "Producto no encontrado." };

  // Solo etiquetas que existen (una recién creada puede llegar con id provisorio)
  // y todo junto: si algo falla, el producto conserva las que tenía.
  const valid = (await prisma.label.findMany({ where: { id: { in: labelIds } }, select: { id: true } })).map((l) => l.id);
  await prisma.$transaction([
    prisma.productLabel.deleteMany({ where: { productId } }),
    prisma.productLabel.createMany({ data: valid.map((labelId) => ({ productId, labelId })), skipDuplicates: true }),
  ]);

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

export async function bulkSetLabel(
  productIds: string[],
  labelId: string,
  remove = false
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff("products.edit");
  if (!productIds.length || !labelId) return { ok: false, error: "Datos inválidos." };

  if (remove) {
    await prisma.productLabel.deleteMany({
      where: { productId: { in: productIds }, labelId },
    });
  } else {
    await prisma.productLabel.createMany({
      data: productIds.map((productId) => ({ productId, labelId })),
      skipDuplicates: true,
    });
  }

  revalidatePath("/admin/products");
  return { ok: true };
}
