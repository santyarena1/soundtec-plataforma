"use server";

/**
 * Series del fabricante (ProductLine): revisión en Rubros › Series, asignación
 * desde la ficha y en lote. Toda asignación o quita manual marca el producto
 * con `lineLocked` para que el llenado automático no la vuelva a cambiar.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { normalizeSeriesName, seriesSlug } from "@/lib/product-lines/detect";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const PERMISSION = "categories.manage";
const idSchema = z.string().min(1).max(64);
const nameSchema = z.string().trim().min(1, "Escribí el nombre de la serie.").max(60, "Máximo 60 caracteres.");

function refresh() {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/portal/products");
}

function cleanName(raw: string): { name: string; slug: string } | { error: string } {
  const parsed = nameSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Nombre inválido." };
  const name = normalizeSeriesName(parsed.data);
  const slug = name ? seriesSlug(name) : "";
  if (!name || !slug) return { error: "Ese nombre no sirve como serie." };
  return { name, slug };
}

export async function markSeriesReviewed(id: string, reviewed: boolean): Promise<Result> {
  await requireStaff(PERMISSION);
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Serie inválida." };
  await prisma.productLine.update({ where: { id }, data: { isReviewed: reviewed } });
  refresh();
  return { ok: true };
}

export async function renameSeries(id: string, rawName: string): Promise<Result> {
  await requireStaff(PERMISSION);
  const n = cleanName(rawName);
  if ("error" in n) return { ok: false, error: n.error };
  const series = await prisma.productLine.findUnique({ where: { id }, select: { brandId: true } });
  if (!series) return { ok: false, error: "La serie ya no existe." };
  const clash = await prisma.productLine.findFirst({ where: { brandId: series.brandId, slug: n.slug, NOT: { id } }, select: { name: true } });
  if (clash) return { ok: false, error: `Ya existe la serie «${clash.name}» en esta marca: usá «Unir con…».` };
  await prisma.productLine.update({ where: { id }, data: { name: n.name, slug: n.slug, isReviewed: true } });
  refresh();
  return { ok: true };
}

/** Pasa los productos de `fromId` a `intoId` (misma marca) y borra `fromId`. */
export async function mergeSeries(fromId: string, intoId: string): Promise<Result> {
  await requireStaff(PERMISSION);
  if (fromId === intoId) return { ok: false, error: "Elegí otra serie." };
  const [from, into] = await Promise.all([
    prisma.productLine.findUnique({ where: { id: fromId }, select: { brandId: true, name: true } }),
    prisma.productLine.findUnique({ where: { id: intoId }, select: { brandId: true, name: true } }),
  ]);
  if (!from || !into) return { ok: false, error: "Alguna de las series ya no existe." };
  if (from.brandId !== into.brandId) return { ok: false, error: "Solo se unen series de la misma marca." };
  const moved = await prisma.$transaction(async (tx) => {
    const r = await tx.product.updateMany({ where: { lineId: fromId }, data: { lineId: intoId } });
    await tx.productLine.delete({ where: { id: fromId } });
    await tx.productLine.update({ where: { id: intoId }, data: { isReviewed: true } });
    return r.count;
  });
  refresh();
  return { ok: true, message: `«${from.name}» unida a «${into.name}» (${moved} productos).` };
}

export async function createSeries(brandId: string, rawName: string): Promise<Result & { id?: string }> {
  await requireStaff(PERMISSION);
  if (!idSchema.safeParse(brandId).success) return { ok: false, error: "Elegí la marca." };
  const n = cleanName(rawName);
  if ("error" in n) return { ok: false, error: n.error };
  const existing = await prisma.productLine.findUnique({ where: { brandId_slug: { brandId, slug: n.slug } }, select: { id: true, name: true } });
  if (existing) return { ok: false, error: `Ya existe la serie «${existing.name}» en esta marca.` };
  const created = await prisma.productLine.create({ data: { brandId, name: n.name, slug: n.slug, source: "MANUAL", isReviewed: true } });
  refresh();
  return { ok: true, id: created.id };
}

/** Saca productos de la serie (quedan sin serie y el llenado automático no los vuelve a tocar). */
export async function removeProductsFromSeries(seriesId: string, productIds: string[]): Promise<Result> {
  await requireStaff(PERMISSION);
  const ids = z.array(idSchema).max(2000).safeParse(productIds);
  if (!ids.success || ids.data.length === 0) return { ok: false, error: "Elegí al menos un producto." };
  const r = await prisma.product.updateMany({ where: { id: { in: ids.data }, lineId: seriesId }, data: { lineId: null, lineLocked: true } });
  refresh();
  return { ok: true, message: `${r.count} productos quedaron sin serie.` };
}

/** Borra una serie vacía. */
export async function deleteEmptySeries(id: string): Promise<Result> {
  await requireStaff(PERMISSION);
  const count = await prisma.product.count({ where: { lineId: id } });
  if (count > 0) return { ok: false, error: "La serie todavía tiene productos: sacalos o unila con otra." };
  await prisma.productLine.delete({ where: { id } });
  refresh();
  return { ok: true };
}

/** Productos de una serie (para «Quitar productos»). */
export async function listSeriesProducts(seriesId: string): Promise<Array<{ id: string; name: string; model: string | null; isActive: boolean }>> {
  await requireStaff(PERMISSION);
  const rows = await prisma.product.findMany({
    where: { lineId: seriesId },
    select: { id: true, normalizedName: true, modelNumber: true, isActive: true },
    orderBy: { normalizedName: "asc" },
    take: 2000,
  });
  return rows.map((r) => ({ id: r.id, name: r.normalizedName, model: r.modelNumber, isActive: r.isActive }));
}

/**
 * Asigna (o quita, con null) la serie a productos sueltos. Solo series de la
 * misma marca del producto; lo demás se saltea y se avisa.
 */
export async function assignSeriesToProducts(productIds: string[], lineId: string | null): Promise<Result> {
  await requireStaff("products.edit");
  const ids = z.array(idSchema).max(5000).safeParse(productIds);
  if (!ids.success || ids.data.length === 0) return { ok: false, error: "Elegí al menos un producto." };
  if (lineId === null) {
    const r = await prisma.product.updateMany({ where: { id: { in: ids.data } }, data: { lineId: null, lineLocked: true } });
    refresh();
    return { ok: true, message: `${r.count} productos sin serie.` };
  }
  const series = await prisma.productLine.findUnique({ where: { id: lineId }, select: { brandId: true, name: true } });
  if (!series) return { ok: false, error: "La serie ya no existe." };
  const r = await prisma.product.updateMany({ where: { id: { in: ids.data }, brandId: series.brandId }, data: { lineId, lineLocked: true } });
  refresh();
  const skipped = ids.data.length - r.count;
  return { ok: true, message: `Serie «${series.name}» en ${r.count} productos.${skipped ? ` ${skipped} de otra marca quedaron igual.` : ""}` };
}
