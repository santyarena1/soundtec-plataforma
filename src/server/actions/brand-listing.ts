"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { categoryPathLabel, listCategoryTree } from "@/lib/category-tree";

/**
 * Lo que decide cómo se ve una marca en el catálogo del cliente:
 * estrella por producto, orden de rubros y «Próximamente».
 */

function revalidateCatalog(): void {
  revalidatePath("/portal/products");
  revalidatePath("/catalogo");
  revalidatePath("/portal");
  revalidatePath("/admin/brands");
}

/** Marca o quita la estrella de un producto (sale primero al entrar a su marca). */
export async function setProductFeatured(productId: string, featured: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff("products.edit");
  const parsed = z.object({ productId: z.string().min(1).max(64), featured: z.boolean() }).safeParse({ productId, featured });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const updated = await prisma.product.updateMany({ where: { id: parsed.data.productId }, data: { isFeatured: parsed.data.featured } });
  if (updated.count === 0) return { ok: false, error: "No se encontró el producto." };
  revalidateCatalog();
  return { ok: true };
}

/** Prende o apaga «Próximamente» en una marca. */
export async function toggleBrandComingSoon(brandId: string, _formData?: FormData): Promise<void> {
  await requireStaff("brands.manage");
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { comingSoon: true } });
  if (!brand) return;
  await prisma.brand.update({ where: { id: brandId }, data: { comingSoon: !brand.comingSoon } });
  revalidateCatalog();
}

export interface BrandCategoryOption {
  id: string;
  /** Ruta legible («Sonido › Bafles pasivos»). */
  label: string;
  level: number;
  /** Productos activos de la marca en ese rubro y todo lo que cuelga de él. */
  count: number;
}

/** Rubros donde la marca tiene productos (con sus ancestros) y el orden guardado. */
export async function getBrandCategoryOrder(brandId: string): Promise<{ order: string[]; options: BrandCategoryOption[] }> {
  await requireStaff("brands.manage");
  const [brand, groups, nodes] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId }, select: { categoryOrder: true } }),
    prisma.product.groupBy({ by: ["categoryId"], where: { brandId, isActive: true, categoryId: { not: null } }, _count: { _all: true } }),
    listCategoryTree(),
  ]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const counts = new Map<string, number>();
  for (const group of groups) {
    let current = group.categoryId ? byId.get(group.categoryId) : undefined;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      counts.set(current.id, (counts.get(current.id) ?? 0) + group._count._all);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  const options = [...counts.entries()]
    .map(([id, count]) => ({ id, label: categoryPathLabel(id, nodes), level: byId.get(id)?.level ?? 1, count }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
  const known = new Set(options.map((o) => o.id));
  return { order: (brand?.categoryOrder ?? []).filter((id) => known.has(id)), options };
}

const orderSchema = z.object({ brandId: z.string().min(1).max(64), order: z.array(z.string().min(1).max(64)).max(200) });

/** Guarda el orden de rubros de la marca (el primero va arriba). */
export async function saveBrandCategoryOrder(brandId: string, order: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff("brands.manage");
  const parsed = orderSchema.safeParse({ brandId, order });
  if (!parsed.success) return { ok: false, error: "Orden inválido." };
  const unique = [...new Set(parsed.data.order)];
  const existing = await prisma.category.findMany({ where: { id: { in: unique } }, select: { id: true } });
  const valid = new Set(existing.map((c) => c.id));
  await prisma.brand.update({ where: { id: parsed.data.brandId }, data: { categoryOrder: unique.filter((id) => valid.has(id)) } });
  revalidateCatalog();
  return { ok: true };
}
