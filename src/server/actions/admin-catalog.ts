"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { slugify } from "@/lib/utils";

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
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = brandSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    logoUrl: formData.get("logoUrl") || null,
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;

  if (id) {
    await prisma.brand.update({
      where: { id },
      data: { name: parsed.data.name, description: parsed.data.description, logoUrl: parsed.data.logoUrl || null, isActive: parsed.data.isActive ?? true },
    });
  } else {
    await prisma.brand.create({
      data: {
        name: parsed.data.name,
        slug: slugify(parsed.data.name),
        description: parsed.data.description,
        logoUrl: parsed.data.logoUrl || null,
        isActive: parsed.data.isActive ?? true,
      },
    });
  }
  revalidatePath("/admin/brands");
}

export async function deleteBrand(formData: FormData): Promise<void> {
  await requireAdmin();
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
  await requireAdmin();
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

const catSchema = z.object({
  name: z.string().min(2).max(120),
  parentId: z.string().optional().nullable(),
});

const familySchema = z.object({
  name: z.string().min(2).max(120),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertFamily(formData: FormData): Promise<void> {
  await requireAdmin();
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

export async function upsertCategory(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = catSchema.safeParse({
    name: formData.get("name"),
    parentId: formData.get("parentId") || null,
  });
  if (!parsed.success) return;

  if (id) {
    await prisma.category.update({
      where: { id },
      data: { name: parsed.data.name, parentId: parsed.data.parentId || null },
    });
  } else {
    await prisma.category.create({
      data: { name: parsed.data.name, slug: slugify(parsed.data.name), parentId: parsed.data.parentId || null },
    });
  }
  revalidatePath("/admin/categories");
}

const productSchema = z.object({
  internalSku: z.string().min(1).max(80),
  supplierSku: z.string().max(80).optional().nullable(),
  normalizedName: z.string().min(2).max(280),
  originalName: z.string().max(280).optional().nullable(),
  brandId: z.string().optional().nullable(),
  distributorId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  familyId: z.string().optional().nullable(),
  shortDescription: z.string().max(500).optional().nullable(),
  longDescription: z.string().max(20000).optional().nullable(),
  baseCostUsd: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  tariffPosition: z.string().max(40).optional().nullable(),
  tariffDutyPercent: z.coerce.number().min(0).optional().nullable(),
  coefNac: z.coerce.number().min(0).optional().nullable(),
  ivaPercent: z.coerce.number().min(0).optional().nullable(),
  impIntPercent: z.coerce.number().min(0).optional().nullable(),
  coefVtaFob: z.coerce.number().min(0).optional().nullable(),
  stockStatus: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "ON_REQUEST", "UNKNOWN"]).default("UNKNOWN"),
  stockQuantity: z.coerce.number().int().min(0).optional().nullable(),
  isCustomizable: z.coerce.boolean().optional(),
  kind: z.enum(["PRINCIPAL", "ACCESORIO"]).default("PRINCIPAL"),
  accessoryRequiredWithPrimary: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")).nullable(),
});

export async function upsertProduct(formData: FormData): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = productSchema.safeParse({
    internalSku: formData.get("internalSku"),
    supplierSku: formData.get("supplierSku") || null,
    normalizedName: formData.get("normalizedName"),
    originalName: formData.get("originalName") || formData.get("normalizedName"),
    brandId: formData.get("brandId") || null,
    distributorId: formData.get("distributorId") || null,
    categoryId: formData.get("categoryId") || null,
    familyId: formData.get("familyId") || null,
    shortDescription: formData.get("shortDescription") || null,
    longDescription: formData.get("longDescription") || null,
    baseCostUsd: formData.get("baseCostUsd"),
    discountPercent: formData.get("discountPercent") || null,
    tariffPosition: formData.get("tariffPosition") || null,
    tariffDutyPercent: formData.get("tariffDutyPercent") || null,
    coefNac: formData.get("coefNac") || null,
    ivaPercent: formData.get("ivaPercent") || null,
    impIntPercent: formData.get("impIntPercent") || null,
    coefVtaFob: formData.get("coefVtaFob") || null,
    stockStatus: formData.get("stockStatus") || "UNKNOWN",
    stockQuantity: formData.get("stockQuantity") || null,
    isCustomizable: formData.get("isCustomizable") === "on" || formData.get("isCustomizable") === "true",
    kind: formData.get("kind") || "PRINCIPAL",
    accessoryRequiredWithPrimary: formData.get("accessoryRequiredWithPrimary") === "on" || formData.get("accessoryRequiredWithPrimary") === "true",
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
    imageUrl: formData.get("imageUrl") || null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const data = {
    internalSku: parsed.data.internalSku,
    supplierSku: parsed.data.supplierSku || null,
    normalizedName: parsed.data.normalizedName,
    originalName: parsed.data.originalName || parsed.data.normalizedName,
    brandId: parsed.data.brandId || null,
    distributorId: parsed.data.distributorId || null,
    categoryId: parsed.data.categoryId || null,
    familyId: parsed.data.familyId || null,
    shortDescription: parsed.data.shortDescription || null,
    longDescription: parsed.data.longDescription || null,
    baseCostUsd: parsed.data.baseCostUsd,
    discountPercent: parsed.data.discountPercent ?? null,
    tariffPosition: parsed.data.tariffPosition || null,
    tariffDutyPercent: parsed.data.tariffDutyPercent ?? null,
    coefNac: parsed.data.coefNac ?? null,
    ivaPercent: parsed.data.ivaPercent ?? null,
    impIntPercent: parsed.data.impIntPercent ?? null,
    coefVtaFob: parsed.data.coefVtaFob ?? null,
    stockStatus: parsed.data.stockStatus,
    stockQuantity: parsed.data.stockQuantity ?? null,
    isCustomizable: parsed.data.isCustomizable ?? false,
    kind: parsed.data.kind,
    accessoryRequiredWithPrimary: parsed.data.accessoryRequiredWithPrimary ?? false,
    isActive: parsed.data.isActive ?? true,
  };

  let productId = id || "";
  if (id) {
    await prisma.product.update({ where: { id }, data });
  } else {
    const created = await prisma.product.create({ data });
    productId = created.id;
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

  revalidatePath("/admin/products");
  if (productId) revalidatePath(`/admin/products/${productId}`);
  return { ok: true, id: productId };
}

const bulkSchema = z.object({
  productIds: z.array(z.string()).min(1),
  action: z.enum(["activate", "deactivate", "set_brand", "set_category", "set_family", "set_discount"]),
  brandId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  familyId: z.string().optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100).optional().nullable(),
});

export async function bulkUpdateProducts(input: z.infer<typeof bulkSchema>): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
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
    case "set_category":
      await prisma.product.updateMany({ where, data: { categoryId: parsed.data.categoryId || null } });
      break;
    case "set_family":
      await prisma.product.updateMany({ where, data: { familyId: parsed.data.familyId || null } });
      break;
    case "set_discount":
      await prisma.product.updateMany({
        where,
        data: { discountPercent: parsed.data.discountPercent ?? null },
      });
      break;
  }
  revalidatePath("/admin/products");
  return { ok: true };
}

const userSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(120).optional().nullable(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "CLIENT"]).default("CLIENT"),
  customRoleId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  companyName: z.string().max(160).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertUser(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") || "").toLowerCase(),
    password: formData.get("password") || null,
    role: formData.get("role") || "CLIENT",
    customRoleId: formData.get("customRoleId") || null,
    clientId: formData.get("clientId") || null,
    companyName: formData.get("companyName") || null,
    phone: formData.get("phone") || null,
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;

  if (parsed.data.role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") return;

  const baseData = {
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    customRoleId: parsed.data.customRoleId || null,
    clientId: parsed.data.role === "CLIENT" ? parsed.data.clientId || null : null,
    companyName: parsed.data.companyName ?? null,
    phone: parsed.data.phone ?? null,
    isActive: parsed.data.isActive ?? true,
  };

  if (id) {
    const updateData: typeof baseData & { passwordHash?: string } = { ...baseData };
    if (parsed.data.password) {
      updateData.passwordHash = await bcrypt.hash(parsed.data.password, 12);
    }
    await prisma.user.update({ where: { id }, data: updateData });
  } else {
    const pwd = parsed.data.password || `Tmp!${Math.random().toString(36).slice(2, 10)}`;
    const hash = await bcrypt.hash(pwd, 12);
    await prisma.user.create({
      data: {
        ...baseData,
        passwordHash: hash,
      },
    });
  }
  revalidatePath("/admin/users");
}

export async function toggleUserActive(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return;
  await prisma.user.update({ where: { id }, data: { isActive: !u.isActive } });
  revalidatePath("/admin/users");
}
