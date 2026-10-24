"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { buildProductSearchWhere, sortBySearchRelevance } from "@/lib/product-search";

/**
 * Relaciones de la ficha:
 * - ACCESSORY: accesorio compatible (se ofrece con el producto; puede ser obligatorio).
 * - INCLUDED: viene en la caja, con cantidad por unidad (la cotización rápida lo agrega sin cargo).
 */

type Result = { ok: true } | { ok: false; error: string };

const linkSchema = z.object({
  productId: z.string().min(1),
  relatedId: z.string().min(1),
  kind: z.enum(["ACCESSORY", "INCLUDED"]),
  isRequired: z.boolean().default(false),
  quantity: z.number().int().min(1, "La cantidad tiene que ser 1 o más.").max(999).default(1),
});

function refresh(...ids: string[]) {
  for (const id of ids) {
    revalidatePath(`/admin/products/${id}`);
    revalidatePath(`/portal/products/${id}`);
  }
}

export async function linkRelatedProduct(input: z.input<typeof linkSchema>): Promise<Result> {
  await requireStaff("products.edit", { costs: true });
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { productId, relatedId, kind, isRequired, quantity } = parsed.data;
  if (productId === relatedId) return { ok: false, error: "Un producto no puede relacionarse consigo mismo." };
  const count = await prisma.product.count({ where: { id: { in: [productId, relatedId] } } });
  if (count !== 2) return { ok: false, error: "El producto ya no existe." };

  const relation = prisma.accessoryRelation.upsert({
    where: { productId_accessoryProductId_kind: { productId, accessoryProductId: relatedId, kind } },
    update: kind === "INCLUDED" ? { quantity } : { isRequired },
    create: { productId, accessoryProductId: relatedId, kind, isRequired: kind === "ACCESSORY" ? isRequired : false, quantity: kind === "INCLUDED" ? quantity : null },
  });
  if (kind === "ACCESSORY") {
    await prisma.$transaction([
      relation,
      // Un accesorio compatible pasa a tipo ACCESORIO y el principal a configurable.
      prisma.product.update({ where: { id: relatedId }, data: { kind: "ACCESORIO" } }),
      prisma.product.update({ where: { id: productId }, data: { isCustomizable: true } }),
    ]);
  } else {
    await relation;
  }
  refresh(productId, relatedId);
  return { ok: true };
}

export async function updateIncludedQuantity(input: { id: string; productId: string; quantity: number }): Promise<Result> {
  await requireStaff("products.edit", { costs: true });
  const quantity = Math.round(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) return { ok: false, error: "La cantidad tiene que ser entre 1 y 999." };
  const updated = await prisma.accessoryRelation.updateMany({ where: { id: input.id, productId: input.productId, kind: "INCLUDED" }, data: { quantity } });
  if (!updated.count) return { ok: false, error: "La relación ya no existe." };
  refresh(input.productId);
  return { ok: true };
}

export async function unlinkRelatedProduct(input: { id: string; productId: string }): Promise<Result> {
  await requireStaff("products.edit", { costs: true });
  const relation = await prisma.accessoryRelation.findFirst({ where: { id: input.id, productId: input.productId }, select: { accessoryProductId: true, kind: true } });
  if (!relation) return { ok: false, error: "La relación ya no existe." };
  await prisma.accessoryRelation.delete({ where: { id: input.id } });
  if (relation.kind === "ACCESSORY") {
    // Si ya no tiene accesorios ni opciones, deja de ser configurable.
    const [accessories, options] = await Promise.all([
      prisma.accessoryRelation.count({ where: { productId: input.productId, kind: "ACCESSORY" } }),
      prisma.productOption.count({ where: { productId: input.productId } }),
    ]);
    if (!accessories && !options) await prisma.product.update({ where: { id: input.productId }, data: { isCustomizable: false } });
  }
  refresh(input.productId, relation.accessoryProductId);
  return { ok: true };
}

export async function searchRelatableProducts(query: string, excludeId: string) {
  await requireStaff("products.edit", { costs: true });
  const q = query.trim();
  if (q.length < 2) return [];
  const found = await prisma.product.findMany({
    where: { id: { not: excludeId }, ...buildProductSearchWhere(q) },
    take: 80,
    select: {
      id: true,
      normalizedName: true,
      originalName: true,
      internalSku: true,
      supplierSku: true,
      modelNumber: true,
      manufacturerItem: true,
      isActive: true,
      kind: true,
      brand: { select: { name: true } },
    },
  });
  return sortBySearchRelevance(found, q, (p) => ({
    normalizedName: p.normalizedName,
    originalName: p.originalName,
    internalSku: p.internalSku,
    supplierSku: p.supplierSku,
    modelNumber: p.modelNumber,
    manufacturerItem: p.manufacturerItem,
    brandName: p.brand?.name ?? null,
  }))
    .slice(0, 12)
    .map((p) => ({ id: p.id, name: p.normalizedName, sku: p.internalSku ?? p.supplierSku, brand: p.brand?.name ?? null, isActive: p.isActive, kind: p.kind }));
}
