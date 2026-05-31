"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const deviceSchema = z.object({
  modelNumber: z.string().min(1).max(200),
  productName: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  subCategory: z.string().max(100).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  protocol: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  sourceUrl: z.string().url().optional().nullable().or(z.literal("")),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertCrestronDevice(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = deviceSchema.safeParse({
    modelNumber: formData.get("modelNumber"),
    productName: formData.get("productName"),
    category: formData.get("category"),
    subCategory: formData.get("subCategory") || null,
    brand: formData.get("brand") || null,
    protocol: formData.get("protocol") || null,
    notes: formData.get("notes") || null,
    sourceUrl: formData.get("sourceUrl") || null,
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;

  const data = {
    modelNumber: parsed.data.modelNumber,
    productName: parsed.data.productName,
    category: parsed.data.category,
    subCategory: parsed.data.subCategory || null,
    brand: parsed.data.brand || null,
    protocol: parsed.data.protocol || null,
    notes: parsed.data.notes || null,
    sourceUrl: parsed.data.sourceUrl || null,
    isActive: parsed.data.isActive ?? true,
  };

  if (id) {
    await db.crestronHomeDevice.update({ where: { id }, data });
  } else {
    await db.crestronHomeDevice.create({ data });
  }
  revalidatePath("/admin/crestron-home");
}

export async function deleteCrestronDevice(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id")?.toString();
  if (!id) return;
  await db.crestronHomeDevice.delete({ where: { id } });
  revalidatePath("/admin/crestron-home");
}
