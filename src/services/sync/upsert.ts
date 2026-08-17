import { Prisma, type ProductRelationKind } from "@prisma/client";
import { slugify } from "@/lib/utils";
import type { NormalizedProduct } from "./types";

type ApplyResult = {
  action: "create" | "update";
  productId: string;
};

function nonEmpty(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

function finite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validDate(value: Date | undefined): Date | undefined {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;
}

function jsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  return value == null ? undefined : value as Prisma.InputJsonValue;
}

async function replaceRelations(
  tx: Prisma.TransactionClient,
  productId: string,
  kind: ProductRelationKind,
  skus: string[] | undefined
): Promise<void> {
  const cleanSkus = (skus ?? []).map((sku) => sku.trim()).filter(Boolean);
  if (cleanSkus.length === 0) return;

  const products = await tx.product.findMany({
    where: { supplierSku: { in: cleanSkus } },
    select: { id: true, supplierSku: true },
  });
  const bySku = new Map(
    products
      .filter((product) => !!product.supplierSku)
      .map((product) => [product.supplierSku!, product.id])
  );

  await tx.accessoryRelation.deleteMany({ where: { productId, kind } });
  const data = cleanSkus
    .map((sku) => bySku.get(sku))
    .filter((id): id is string => !!id && id !== productId)
    .map((accessoryProductId) => ({
      productId,
      accessoryProductId,
      isRequired: false,
      kind,
    }));

  if (data.length > 0) {
    await tx.accessoryRelation.createMany({ data, skipDuplicates: true });
  }
}

export async function applyNormalizedProduct(
  tx: Prisma.TransactionClient,
  n: NormalizedProduct
): Promise<ApplyResult> {
  const matchValue = n.matchValue.trim();
  const name = n.name.trim();
  if (!matchValue) throw new Error("NormalizedProduct.matchValue is required");
  if (!name) throw new Error("NormalizedProduct.name is required");

  const existing = await tx.product.findFirst({
    where: { [n.matchField]: matchValue },
    select: { id: true, originalName: true },
  });
  const brandName = nonEmpty(n.brandName);
  const categoryName = nonEmpty(n.categoryName);
  const familyName = nonEmpty(n.familyName);
  let brand: { id: string } | undefined = undefined;
  if (brandName) {
    const brandSlug = slugify(brandName);
    brand = await tx.brand.findFirst({
      where: {
        OR: [
          { name: { equals: brandName, mode: "insensitive" } },
          { slug: brandSlug },
        ],
      },
      select: { id: true },
    }) ?? undefined;
    if (!brand) {
      try {
        brand = await tx.brand.create({
          data: { name: brandName, slug: brandSlug },
          select: { id: true },
        });
      } catch {
        brand = await tx.brand.findFirst({
          where: {
            OR: [
              { name: { equals: brandName, mode: "insensitive" } },
              { slug: brandSlug },
            ],
          },
          select: { id: true },
        }) ?? undefined;
      }
    }
  }
  let category: { id: string } | undefined = undefined;
  if (categoryName) {
    const categorySlug = slugify(categoryName);
    category = await tx.category.findFirst({
      where: {
        OR: [
          { name: { equals: categoryName, mode: "insensitive" } },
          { slug: categorySlug },
        ],
      },
      select: { id: true },
    }) ?? undefined;
    if (!category) {
      try {
        category = await tx.category.create({
          data: { name: categoryName, slug: categorySlug },
          select: { id: true },
        });
      } catch {
        category = await tx.category.findFirst({
          where: {
            OR: [
              { name: { equals: categoryName, mode: "insensitive" } },
              { slug: categorySlug },
            ],
          },
          select: { id: true },
        }) ?? undefined;
      }
    }
  }
  const family = familyName
    ? await tx.productFamily.findFirst({
        where: { name: { equals: familyName, mode: "insensitive" } },
        select: { id: true },
      }) ?? undefined
    : undefined;

  const sharedData = {
    baseCostUsd: finite(n.baseCostUsd),
    currency: nonEmpty(n.currency),
    discountPercent: finite(n.discountPercent),
    stockStatus: n.stockStatus,
    stockQuantity: finite(n.stockQuantity) === undefined
      ? undefined
      : Math.trunc(n.stockQuantity!),
    availabilityType: nonEmpty(n.availabilityType),
    availabilityMessage: nonEmpty(n.availabilityMessage),
    shortDescription: nonEmpty(n.shortDescription),
    longDescription: nonEmpty(n.longDescription),
    htmlContent: nonEmpty(n.htmlContent),
    modelNumber: nonEmpty(n.modelNumber),
    manufacturerItem: nonEmpty(n.manufacturerItem),
    metaTitle: nonEmpty(n.metaTitle),
    metaDescription: nonEmpty(n.metaDescription),
    metaKeywords: nonEmpty(n.metaKeywords),
    salePriceUsd: finite(n.salePriceUsd),
    salePriceStartsAt: validDate(n.salePriceStartsAt),
    salePriceEndsAt: validDate(n.salePriceEndsAt),
    salePriceLabel: nonEmpty(n.salePriceLabel),
    requiresQuote: typeof n.requiresQuote === "boolean" ? n.requiresQuote : undefined,
    badges: n.badges && n.badges.length > 0
      ? jsonValue(n.badges)
      : undefined,
    weight: finite(n.weight),
    volume: finite(n.volume),
    widthCm: finite(n.widthCm),
    heightCm: finite(n.heightCm),
    depthCm: finite(n.depthCm),
    urlSlug: nonEmpty(n.urlSlug),
    vendorProductUrl: nonEmpty(n.vendorProductUrl),
    videoUrl: nonEmpty(n.videoUrl),
    brandId: brand?.id,
    categoryId: category?.id,
    familyId: family?.id,
    familia: nonEmpty(n.familia),
    tipo: nonEmpty(n.tipo),
    specifications: n.specifications && n.specifications.length > 0
      ? jsonValue(n.specifications)
      : undefined,
    documents: n.documents && n.documents.length > 0
      ? jsonValue(n.documents)
      : undefined,
    sourceMetadata: jsonValue(n.raw),
  };
  const data: Prisma.ProductUncheckedUpdateInput = { ...sharedData };

  const originalName = nonEmpty(n.originalName);
  const normalizedNameOverride = nonEmpty(n.normalizedNameOverride);
  let result: ApplyResult;
  if (existing) {
    if (normalizedNameOverride) data.normalizedName = normalizedNameOverride;
    if (
      originalName &&
      (n.matchField === "supplierSku" || !existing.originalName.trim())
    ) {
      data.originalName = originalName;
    }
    await tx.product.update({ where: { id: existing.id }, data });
    result = { action: "update", productId: existing.id };
  } else {
    const createData: Prisma.ProductUncheckedCreateInput = {
      ...sharedData,
      [n.matchField]: matchValue,
      normalizedName: normalizedNameOverride ?? name,
      originalName: originalName ?? name,
      baseCostUsd: finite(n.baseCostUsd) ?? 0,
    };
    const created = await tx.product.create({
      data: createData,
      select: { id: true },
    });
    result = { action: "create", productId: created.id };
  }

  if (n.images && n.images.length > 0) {
    const images = n.images
      .filter((image) => image.url.trim())
      .map((image) => ({
        ...image,
        url: image.url.trim(),
        source: nonEmpty(image.source) ?? "supplier",
      }));
    for (const source of new Set(images.map((image) => image.source))) {
      const sourceImages = images.filter((image) => image.source === source);
      await tx.productImage.deleteMany({
        where: { productId: result.productId, source },
      });
      if (sourceImages.length > 0) {
        await tx.productImage.createMany({
          data: sourceImages.map((image) => ({
            productId: result.productId,
            url: image.url,
            alt: nonEmpty(image.alt),
            source,
            isPrimary: image.isPrimary ?? false,
          })),
        });
      }
    }
  }

  await replaceRelations(tx, result.productId, "ACCESSORY", n.accessorySkus);
  await replaceRelations(tx, result.productId, "CROSS_SELL", n.crossSellSkus);
  await replaceRelations(tx, result.productId, "ALSO_PURCHASED", n.alsoPurchasedSkus);

  return result;
}
