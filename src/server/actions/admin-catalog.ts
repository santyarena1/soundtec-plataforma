"use server";

import { revalidatePath } from "next/cache";
import { isCommercialTag } from "@/lib/commercial-tags";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { adminProductFiltersSchema, hasAdminProductFilters } from "@/lib/admin-product-filters";
import { buildAdminProductWhere } from "@/lib/admin-product-where";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { slugify } from "@/lib/utils";
import {
  SCALAR_PRODUCT_FIELDS,
  changedScalarFields,
  mergeFieldTimestamps,
} from "@/lib/field-timestamps";
import { buildProductSearchKey, normalizeForSearch } from "@/lib/search-key";
import { checkImageUrl } from "@/server/actions/brand-logos";
import { validateProductRubro } from "@/server/categories/rubros";
import { moveProductsToRubro, moveReviewMessage } from "@/server/categories/move";
import { proposePriceReview } from "@/server/price-review/reviews";

type TimestampedProductCreateInput = Prisma.ProductUncheckedCreateInput & {
  fieldUpdatedAt?: Prisma.InputJsonValue;
  searchKey?: string;
};

/**
 * Decisión técnica: estas server actions se invocan directamente desde
 * `<form action>`, por eso retornan `Promise<void>`. Para feedback en cliente
 * (useTransition) usamos las acciones que sí retornan { ok, error } abajo.
 */

const brandSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().nullable(),
  logoUrl: z.string().url().optional().or(z.literal("")).nullable(),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertBrand(formData: FormData): Promise<void> {
  await requireStaff("brands.manage");
  const id = formData.get("id")?.toString() || undefined;
  const parsed = brandSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    logoUrl: formData.get("logoUrl") || null,
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;

  // El logo se maneja aparte (subir archivo / URL validada). Acá solo se toma
  // si viene el campo y es una imagen de verdad, nunca una página web.
  let logoUrl: string | null | undefined;
  if (formData.has("logoUrl")) {
    const raw = parsed.data.logoUrl?.trim();
    logoUrl = raw && (await checkImageUrl(raw)).ok ? raw : null;
  }

  if (id) {
    await prisma.brand.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        ...(logoUrl !== undefined && logoUrl !== null ? { logoUrl } : {}),
        isActive: parsed.data.isActive ?? true,
      },
    });
  } else {
    await prisma.brand.create({
      data: {
        name: parsed.data.name,
        slug: slugify(parsed.data.name),
        description: parsed.data.description,
        logoUrl: logoUrl ?? null,
        isActive: parsed.data.isActive ?? true,
      },
    });
  }
  revalidatePath("/admin/brands");
}

export async function deleteBrand(formData: FormData): Promise<void> {
  await requireStaff("brands.manage");
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.brand.delete({ where: { id } });
  revalidatePath("/admin/brands");
}

const distSchema = z.object({
  name: z.string().min(2).max(120),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertDistributor(formData: FormData): Promise<void> {
  await requireStaff("distributors.manage", { costs: true });
  const id = formData.get("id")?.toString() || undefined;
  const parsed = distSchema.safeParse({
    name: formData.get("name"),
    notes: formData.get("notes") || null,
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;

  if (id) {
    await prisma.distributor.update({
      where: { id },
      data: { name: parsed.data.name, notes: parsed.data.notes, isActive: parsed.data.isActive ?? true },
    });
  } else {
    await prisma.distributor.create({
      data: { name: parsed.data.name, slug: slugify(parsed.data.name), notes: parsed.data.notes, isActive: parsed.data.isActive ?? true },
    });
  }
  revalidatePath("/admin/distributors");
}

const familySchema = z.object({
  name: z.string().min(2).max(120),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertFamily(formData: FormData): Promise<void> {
  await requireStaff("families.manage");
  const id = formData.get("id")?.toString() || undefined;
  const parsed = familySchema.safeParse({
    name: formData.get("name"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;
  if (id) {
    await prisma.productFamily.update({
      where: { id },
      data: { name: parsed.data.name, isActive: parsed.data.isActive ?? true },
    });
  } else {
    await prisma.productFamily.create({
      data: { name: parsed.data.name, slug: slugify(parsed.data.name), isActive: parsed.data.isActive ?? true },
    });
  }
  revalidatePath("/admin/families");
}

/**
 * Retirada: creaba categorías planas, fuera del árbol de Tango, que no
 * aparecían en ningún selector. Los subrubros se crean con «Crear subrubro
 * acá» (src/server/actions/rubros.ts), que valida nivel, nombre y duplicados.
 */
export async function upsertCategory(formData: FormData): Promise<void> {
  await requireStaff("categories.manage");
  void formData;
}

const productSchema = z.object({
  /** Opcional: un producto puede existir en el sistema aunque no esté en Tango. */
  internalSku: z.string().trim().max(80).optional().nullable(),
  supplierSku: z.string().max(80).optional().nullable(),
  normalizedName: z.string().min(2).max(280),
  originalName: z.string().max(280).optional().nullable(),
  brandId: z.string().optional().nullable(),
  distributorId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  familyId: z.string().optional().nullable(),
  /** Serie del fabricante (ProductLine). Sin el campo en el form no se toca. */
  lineId: z.string().max(64).optional().nullable(),
  familia: z.string().max(120).optional().nullable(),
  line: z.string().trim().max(80).optional().nullable(),
  tipo: z.string().max(120).optional().nullable(),
  shortDescription: z.string().max(500).optional().nullable(),
  longDescription: z.string().max(20000).optional().nullable(),
  baseCostUsd: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  tariffPosition: z.string().max(40).optional().nullable(),
  tariffDutyPercent: z.coerce.number().min(0).optional().nullable(),
  aecPercent: z.coerce.number().min(0).optional().nullable(),
  tePercent: z.coerce.number().min(0).optional().nullable(),
  coo: z.string().max(100).optional().nullable(),
  weight: z.coerce.number().min(0).optional().nullable(),
  volume: z.coerce.number().min(0).optional().nullable(),
  coefNac: z.coerce.number().min(0).optional().nullable(),
  coefVta: z.coerce.number().min(0).optional().nullable(),
  ivaPercent: z.coerce.number().min(0).optional().nullable(),
  impIntPercent: z.coerce.number().min(0).optional().nullable(),
  coefVtaFob: z.coerce.number().min(0).optional().nullable(),
  stockStatus: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "ON_REQUEST", "UNKNOWN"]).default("UNKNOWN"),
  stockQuantity: z.coerce.number().int().min(0).optional().nullable(),
  /** Cartel comercial; "" = automático. Sin el campo en el form no se toca. */
  commercialTag: z.string().max(40).optional(),
  isCustomizable: z.coerce.boolean().optional(),
  isCrestronHomeCompatible: z.coerce.boolean().optional(),
  kind: z.enum(["PRINCIPAL", "ACCESORIO"]).default("PRINCIPAL"),
  accessoryRequiredWithPrimary: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  requiresQuote: z.boolean().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")).nullable(),
});

/** Guarda y traduce los errores conocidos a un mensaje (SKU repetido) en vez de romper la página. */
async function saveProductRow(write: () => Promise<unknown>): Promise<{ ok: false; error: string } | null> {
  try {
    await write();
    return null;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String((error.meta as { target?: unknown } | undefined)?.target ?? "");
      return { ok: false, error: target.includes("internalSku") ? "Ya hay otro producto con ese COD. TANGO." : "Ya existe un producto con esos datos (valor repetido)." };
    }
    console.error("[upsertProduct]", error);
    return { ok: false, error: "No se pudo guardar el producto." };
  }
}

export async function upsertProduct(formData: FormData): Promise<{ ok: boolean; id?: string; error?: string; notice?: string }> {
  const { user: actorUser } = await requireStaff("products.edit", { costs: true });
  const id = formData.get("id")?.toString() || undefined;
  const parsed = productSchema.safeParse({
    internalSku: formData.get("internalSku")?.toString().trim() || null,
    supplierSku: formData.get("supplierSku") || null,
    normalizedName: formData.get("normalizedName"),
    originalName: formData.get("originalName") || formData.get("normalizedName"),
    brandId: formData.get("brandId") || null,
    distributorId: formData.get("distributorId") || null,
    categoryId: formData.get("categoryId") || null,
    // Familia (vieja): el formulario ya no la muestra; sin el campo no se toca (la usan reglas de precio FAMILY).
    familyId: formData.has("familyId") ? formData.get("familyId") || null : undefined,
    lineId: formData.has("lineId") ? String(formData.get("lineId") || "") || null : undefined,
    familia: formData.get("familia") || null,
    line: formData.has("line") ? String(formData.get("line") || "").trim() || null : undefined,
    tipo: formData.get("tipo") || null,
    shortDescription: formData.get("shortDescription") || null,
    longDescription: formData.get("longDescription") || null,
    baseCostUsd: formData.get("baseCostUsd"),
    discountPercent: formData.get("discountPercent") || null,
    tariffPosition: formData.get("tariffPosition") || null,
    tariffDutyPercent: formData.get("tariffDutyPercent") || null,
    aecPercent: formData.get("aecPercent") || null,
    tePercent: formData.get("tePercent") || null,
    coo: formData.get("coo") || null,
    weight: formData.get("weight") || null,
    volume: formData.get("volume") || null,
    coefNac: formData.get("coefNac") || null,
    coefVta: formData.get("coefVta") || null,
    ivaPercent: formData.get("ivaPercent") || null,
    impIntPercent: formData.get("impIntPercent") || null,
    coefVtaFob: formData.get("coefVtaFob") || null,
    stockStatus: formData.get("stockStatus") || "UNKNOWN",
    stockQuantity: formData.get("stockQuantity") || null,
    commercialTag: formData.has("commercialTag") ? String(formData.get("commercialTag") || "") : undefined,
    isCustomizable: formData.get("isCustomizable") === "on" || formData.get("isCustomizable") === "true",
    isCrestronHomeCompatible: formData.get("isCrestronHomeCompatible") === "on" || formData.get("isCrestronHomeCompatible") === "true",
    kind: formData.get("kind") || "PRINCIPAL",
    accessoryRequiredWithPrimary: formData.get("accessoryRequiredWithPrimary") === "on" || formData.get("accessoryRequiredWithPrimary") === "true",
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
    // Solo si el formulario trae la casilla (otros formularios no la tocan).
    requiresQuote: formData.has("requiresQuotePresent") ? formData.get("requiresQuote") === "on" : undefined,
    imageUrl: formData.get("imageUrl") || null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const data: TimestampedProductCreateInput = {
    internalSku: parsed.data.internalSku || null,
    supplierSku: parsed.data.supplierSku || null,
    normalizedName: parsed.data.normalizedName,
    originalName: parsed.data.originalName || parsed.data.normalizedName,
    brandId: parsed.data.brandId || null,
    distributorId: parsed.data.distributorId || null,
    categoryId: parsed.data.categoryId || null,
    ...(parsed.data.familyId !== undefined ? { familyId: parsed.data.familyId || null } : {}),
    ...(parsed.data.lineId !== undefined ? { lineId: parsed.data.lineId || null } : {}),
    familia: parsed.data.familia || null,
    ...(parsed.data.line !== undefined ? { line: parsed.data.line || null } : {}),
    tipo: parsed.data.tipo || null,
    shortDescription: parsed.data.shortDescription || null,
    longDescription: parsed.data.longDescription || null,
    baseCostUsd: parsed.data.baseCostUsd,
    discountPercent: parsed.data.discountPercent ?? null,
    tariffPosition: parsed.data.tariffPosition || null,
    tariffDutyPercent: parsed.data.tariffDutyPercent ?? null,
    aecPercent: parsed.data.aecPercent ?? null,
    tePercent: parsed.data.tePercent ?? null,
    coo: parsed.data.coo || null,
    weight: parsed.data.weight ?? null,
    volume: parsed.data.volume ?? null,
    coefNac: parsed.data.coefNac ?? null,
    coefVta: parsed.data.coefVta ?? null,
    ivaPercent: parsed.data.ivaPercent ?? null,
    impIntPercent: parsed.data.impIntPercent ?? null,
    coefVtaFob: parsed.data.coefVtaFob ?? null,
    stockStatus: parsed.data.stockStatus,
    stockQuantity: parsed.data.stockQuantity ?? null,
    ...(parsed.data.commercialTag !== undefined
      ? { commercialTag: isCommercialTag(parsed.data.commercialTag) ? parsed.data.commercialTag : null }
      : {}),
    isCustomizable: parsed.data.isCustomizable ?? false,
    isCrestronHomeCompatible: parsed.data.isCrestronHomeCompatible ?? false,
    kind: parsed.data.kind,
    accessoryRequiredWithPrimary: parsed.data.accessoryRequiredWithPrimary ?? false,
    isActive: parsed.data.isActive ?? true,
    // Estrella (sale primero en su marca): solo si el formulario trae la casilla.
    ...(formData.has("isFeaturedPresent") ? { isFeatured: formData.get("isFeatured") === "on" } : {}),
  };

  if (parsed.data.lineId) {
    const series = await prisma.productLine.findUnique({ where: { id: parsed.data.lineId }, select: { brandId: true } });
    if (!series) return { ok: false, error: "La serie elegida ya no existe." };
    if (series.brandId !== (parsed.data.brandId || null)) return { ok: false, error: "La serie elegida es de otra marca." };
  }

  let productId = id || "";
  // Rubro: solo nodos del árbol de Tango (el servidor no confía en el selector).
  // Si cambia y hay reglas por rubro, el movimiento pasa por la revisión de precios.
  let pendingRubro: string | null = null;
  const currentRubro = id ? (await prisma.product.findUnique({ where: { id }, select: { categoryId: true } }))?.categoryId ?? null : null;
  const wantedRubro = parsed.data.categoryId || null;
  if (wantedRubro !== currentRubro) {
    const rubroOk = await validateProductRubro(prisma, wantedRubro, currentRubro);
    if (!rubroOk.ok) return { ok: false, error: rubroOk.error };
    if (id && wantedRubro) {
      data.categoryId = currentRubro;
      pendingRubro = wantedRubro;
    }
  }
  const selectedBrand = parsed.data.brandId
    ? await prisma.brand.findUnique({ where: { id: parsed.data.brandId }, select: { name: true } })
    : null;
  if (id) {
    const current = await prisma.product.findUniqueOrThrow({ where: { id } });
    // Serie elegida a mano: el llenado automático no la vuelve a cambiar.
    if (parsed.data.lineId !== undefined && (parsed.data.lineId || null) !== current.lineId) data.lineLocked = true;
    if (parsed.data.requiresQuote !== undefined) {
      // Cargar un costo nuevo saca «Consultá precio» si nadie tocó la casilla: esa marca
      // la dejan los syncs cuando no hay precio, y antes quedaba aunque después se cargara uno.
      const costChanged = Number(current.baseCostUsd) !== parsed.data.baseCostUsd && parsed.data.baseCostUsd > 0;
      const untouched = parsed.data.requiresQuote === current.requiresQuote;
      data.requiresQuote = current.requiresQuote && costChanged && untouched ? false : parsed.data.requiresQuote;
    }
    data.searchKey = buildProductSearchKey({
      internalSku: parsed.data.internalSku,
      supplierSku: parsed.data.supplierSku,
      normalizedName: parsed.data.normalizedName,
      originalName: parsed.data.originalName || parsed.data.normalizedName,
      modelNumber: current.modelNumber,
      manufacturerItem: current.manufacturerItem,
      brandName: selectedBrand?.name,
    });
    const changed = changedScalarFields(
      current as unknown as Record<string, unknown>,
      data as Record<string, unknown>
    );
    if (changed.length > 0) {
      data.fieldUpdatedAt = mergeFieldTimestamps(
        (current as unknown as { fieldUpdatedAt?: unknown }).fieldUpdatedAt,
        changed,
        new Date().toISOString()
      );
    }
    const saved = await saveProductRow(() => prisma.product.update({ where: { id }, data }));
    if (saved) return saved;
  } else {
    data.searchKey = buildProductSearchKey({
      internalSku: parsed.data.internalSku,
      supplierSku: parsed.data.supplierSku,
      normalizedName: parsed.data.normalizedName,
      originalName: parsed.data.originalName || parsed.data.normalizedName,
      brandName: selectedBrand?.name,
    });
    if (parsed.data.lineId) data.lineLocked = true;
    const providedFields = SCALAR_PRODUCT_FIELDS.filter(
      (field) => (data as Record<string, unknown>)[field] !== undefined
    );
    data.fieldUpdatedAt = mergeFieldTimestamps(
      {},
      providedFields,
      new Date().toISOString()
    );
    let createdId = "";
    const saved = await saveProductRow(async () => {
      createdId = (await prisma.product.create({ data })).id;
    });
    if (saved) return saved;
    productId = createdId;
  }

  if (parsed.data.imageUrl && productId) {
    const exists = await prisma.productImage.findFirst({
      where: { productId, url: parsed.data.imageUrl },
    });
    if (!exists) {
      await prisma.productImage.updateMany({
        where: { productId },
        data: { isPrimary: false },
      });
      await prisma.productImage.create({
        data: {
          productId,
          url: parsed.data.imageUrl,
          alt: parsed.data.normalizedName,
          source: "upload",
          isPrimary: true,
        },
      });
    }
  }

  let notice: string | undefined;
  if (pendingRubro && productId) {
    const moved = await moveProductsToRubro([productId], pendingRubro, { id: actorUser.id, name: actorUser.name ?? actorUser.email ?? null }, `Cambio de rubro: ${parsed.data.normalizedName}`);
    if (!moved.ok) return { ok: false, id: productId, error: moved.error };
    if (!moved.applied) notice = moveReviewMessage(moved);
  }

  revalidatePath("/admin/products");
  if (productId) revalidatePath(`/admin/products/${productId}`);
  return { ok: true, id: productId, notice };
}

const bulkSchema = z.object({
  productIds: z.array(z.string()).min(1),
  action: z.enum(["activate", "deactivate", "set_brand", "set_category", "set_line", "set_discount", "set_crestron", "unset_crestron", "set_accessory", "set_principal"]),
  brandId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  /** Serie (set_line): null = sacar la serie. Solo se aplica a productos de la misma marca. */
  lineId: z.string().optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100).optional().nullable(),
});

export async function bulkUpdateProducts(input: z.infer<typeof bulkSchema>): Promise<{ ok: boolean; error?: string; notice?: string; reviewId?: string }> {
  const { user: actorUser } = await requireStaff("products.edit", { costs: true });
  const actor = { id: actorUser.id, name: actorUser.name ?? actorUser.email ?? null };
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const where = { id: { in: parsed.data.productIds } };
  switch (parsed.data.action) {
    case "activate":
      await prisma.product.updateMany({ where, data: { isActive: true } });
      break;
    case "deactivate":
      await prisma.product.updateMany({ where, data: { isActive: false } });
      break;
    case "set_brand":
      await prisma.product.updateMany({ where, data: { brandId: parsed.data.brandId || null } });
      break;
    case "set_category": {
      if (!parsed.data.categoryId) return { ok: false, error: "Elegí un rubro del árbol." };
      const moved = await moveProductsToRubro(parsed.data.productIds, parsed.data.categoryId, actor, `Mover ${parsed.data.productIds.length} productos de rubro (edición en lote)`);
      if (!moved.ok) return moved;
      if (!moved.applied) {
        revalidatePath("/admin/products");
        return { ok: true, notice: moveReviewMessage(moved), reviewId: moved.reviewId };
      }
      break;
    }
    case "set_line": {
      if (!parsed.data.lineId) {
        await prisma.product.updateMany({ where, data: { lineId: null, lineLocked: true } });
        break;
      }
      const series = await prisma.productLine.findUnique({ where: { id: parsed.data.lineId }, select: { brandId: true } });
      if (!series) return { ok: false, error: "La serie elegida ya no existe." };
      await prisma.product.updateMany({ where: { ...where, brandId: series.brandId }, data: { lineId: parsed.data.lineId, lineLocked: true } });
      break;
    }
    case "set_discount": {
      // Descuento de producto en lote: cambia precios, pasa por la revisión.
      const review = await proposePriceReview(
        { type: "products.setDiscount", productIds: parsed.data.productIds, discountPercent: parsed.data.discountPercent ?? null },
        `Descuento ${parsed.data.discountPercent ?? 0} % en ${parsed.data.productIds.length} productos (edición en lote)`,
        actor
      );
      revalidatePath("/admin/price-reviews");
      return {
        ok: true,
        reviewId: review.id,
        notice: review.affectedProducts === 0
          ? "No cambia ningún precio: aplicalo con un clic en Precios › Revisión de cambios."
          : `Mueve el precio de ${review.affectedProducts} productos: quedó en Precios › Revisión de cambios para aplicarlo.`,
      };
    }
    case "set_crestron":
      await prisma.product.updateMany({ where, data: { isCrestronHomeCompatible: true } });
      break;
    case "unset_crestron":
      await prisma.product.updateMany({ where, data: { isCrestronHomeCompatible: false } });
      break;
    case "set_accessory":
      await prisma.product.updateMany({ where, data: { kind: "ACCESORIO" } });
      break;
    case "set_principal":
      await prisma.product.updateMany({ where, data: { kind: "PRINCIPAL" } });
      break;
  }
  revalidatePath("/admin/products");
  return { ok: true };
}

/**
 * Activa o desactiva productos por filtro (sin requerir selección manual).
 *
 * Pensado para casos como "activar todos los productos de SONANCE" después
 * de un import donde quedaron inactivos sin querer. Los filtros usan la misma
 * forma que la página /admin/products (brandIds, etc.).
 */
const bulkByFilterSchema = z.object({
  isActive: z.boolean(),
  /** Los filtros del listado tal cual (mismo where que lo que se ve). */
  filters: adminProductFiltersSchema.optional(),
  /** «Todos los de la marca X», sin los demás filtros. */
  brandId: z.string().optional(),
  onlyInactive: z.boolean().optional(),
  onlyActive: z.boolean().optional(),
});

export async function bulkSetActiveByFilter(
  input: z.infer<typeof bulkByFilterSchema>
): Promise<{ ok: boolean; affected: number; error?: string }> {
  await requireStaff("products.edit", { costs: true });
  const parsed = bulkByFilterSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, affected: 0, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const { filters, brandId } = parsed.data;
  if (!brandId && (!filters || !hasAdminProductFilters(filters))) {
    return { ok: false, affected: 0, error: "Poné al menos un filtro o elegí una marca." };
  }
  const base = brandId ? { brandId } : await buildAdminProductWhere(filters!);
  const where: Prisma.ProductWhereInput = {
    AND: [
      base,
      // Solo los que cambiarían.
      ...(parsed.data.onlyInactive ? [{ isActive: false }] : []),
      ...(parsed.data.onlyActive ? [{ isActive: true }] : []),
    ],
  };

  const result = await prisma.product.updateMany({
    where,
    data: { isActive: parsed.data.isActive },
  });
  revalidatePath("/admin/products");
  return { ok: true, affected: result.count };
}

