"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { applyCrestronHomeFlags, OFFICIAL_CRESTRON_HOME, planCrestronHomeFlags } from "@/services/crestron-home/apply";

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
  await requireStaff("products.edit");
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
  await requireStaff("products.edit");
  const id = formData.get("id")?.toString();
  if (!id) return;
  await db.crestronHomeDevice.delete({ where: { id } });
  revalidatePath("/admin/crestron-home");
}

/**
 * Marca Crestron Home según la lista OFICIAL de docs.crestron.com
 * (src/data/crestron-home-official.json). Es la única fuente de verdad: antes se
 * comparaba con esta tabla buscando el modelo dentro del nombre ("M3" marcaba
 * cualquier cosa). Mismo cálculo que scripts/crestron-home-apply.ts.
 */
export async function matchCrestronProducts(): Promise<{ ok: boolean; matched: number; total: number }> {
  await requireStaff("products.edit");
  const plan = await planCrestronHomeFlags();
  await applyCrestronHomeFlags(plan);
  revalidatePath("/admin/crestron-home");
  revalidatePath("/admin/products");
  return { ok: true, matched: plan.willBeTrue, total: plan.officialModels };
}

export async function toggleProductCrestron(productId: string, value: boolean): Promise<{ ok: boolean }> {
  await requireStaff("products.edit");
  await prisma.product.update({ where: { id: productId }, data: { isCrestronHomeCompatible: value } });
  revalidatePath("/admin/crestron-home");
  revalidatePath("/admin/products");
  return { ok: true };
}

/** Carga en la tabla de referencia los modelos de la lista oficial que falten. */
export async function seedCrestronDevices(): Promise<{ ok: boolean; created: number }> {
  await requireStaff("products.edit");
  let created = 0;
  for (const m of OFFICIAL_CRESTRON_HOME.models) {
    const existing = await db.crestronHomeDevice.findFirst({ where: { modelNumber: m.model } });
    if (existing) continue;
    await db.crestronHomeDevice.create({
      data: {
        modelNumber: m.model,
        productName: m.model,
        category: m.categories[0] ?? "Crestron Home",
        brand: "Crestron",
        sourceUrl: m.url,
        notes: `Lista oficial Works with Crestron Home (${OFFICIAL_CRESTRON_HOME.fetchedAt.slice(0, 10)})`,
        isActive: true,
      },
    });
    created++;
  }
  revalidatePath("/admin/crestron-home");
  return { ok: true, created };
}
