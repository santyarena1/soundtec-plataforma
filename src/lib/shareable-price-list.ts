import { Prisma, ProductKind, StockStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePricesForProducts, getClientVisibility } from "@/lib/pricing";
import { getGlobalMarginPercent } from "@/lib/settings";

export interface ShareablePriceListFilters {
  brandIds?: string[];
  categoryIds?: string[];
  familyIds?: string[];
  distributorIds?: string[];
  productIds?: string[];
  excludeProductIds?: string[];
  kinds?: ProductKind[];
  search?: string;
  inStockOnly?: boolean;
  hasDiscountOnly?: boolean;
}

export function parseShareListFilters(raw: unknown): ShareablePriceListFilters {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : undefined);
  const kinds = arr(o.kinds)?.filter((k): k is ProductKind => k === "PRINCIPAL" || k === "ACCESORIO");
  return {
    brandIds: arr(o.brandIds),
    categoryIds: arr(o.categoryIds),
    familyIds: arr(o.familyIds),
    distributorIds: arr(o.distributorIds),
    productIds: arr(o.productIds),
    excludeProductIds: arr(o.excludeProductIds),
    kinds: kinds?.length ? kinds : undefined,
    search: typeof o.search === "string" ? o.search.trim() || undefined : undefined,
    inStockOnly: o.inStockOnly === true,
    hasDiscountOnly: o.hasDiscountOnly === true,
  };
}

export function buildProductWhereFromFilters(filters: ShareablePriceListFilters): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [{ isActive: true }];

  if (filters.brandIds?.length) and.push({ brandId: { in: filters.brandIds } });
  if (filters.categoryIds?.length) and.push({ categoryId: { in: filters.categoryIds } });
  if (filters.familyIds?.length) and.push({ familyId: { in: filters.familyIds } });
  if (filters.distributorIds?.length) and.push({ distributorId: { in: filters.distributorIds } });
  if (filters.productIds?.length) and.push({ id: { in: filters.productIds } });
  if (filters.kinds?.length) and.push({ kind: { in: filters.kinds } });

  if (filters.inStockOnly) {
    and.push({ stockStatus: { in: [StockStatus.IN_STOCK, StockStatus.LOW_STOCK] } });
  }
  if (filters.hasDiscountOnly) {
    and.push({ discountPercent: { gt: 0 } });
  }

  if (filters.search) {
    const q = filters.search;
    and.push({
      OR: [
        { normalizedName: { contains: q, mode: "insensitive" } },
        { originalName: { contains: q, mode: "insensitive" } },
        { internalSku: { contains: q, mode: "insensitive" } },
        { supplierSku: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const where: Prisma.ProductWhereInput = { AND: and };
  if (filters.excludeProductIds?.length) {
    where.NOT = { id: { in: filters.excludeProductIds } };
  }
  return where;
}

export async function applyClientVisibilityToWhere(
  clientId: string,
  where: Prisma.ProductWhereInput
): Promise<Prisma.ProductWhereInput> {
  const vis = await getClientVisibility(clientId);
  const hidden = vis.hidden;
  const extraAnd: Prisma.ProductWhereInput[] = [];

  if (hidden.productIds.size) extraAnd.push({ id: { notIn: [...hidden.productIds] } });
  if (hidden.brandIds.size) {
    extraAnd.push({ OR: [{ brandId: null }, { brandId: { notIn: [...hidden.brandIds] } }] });
  }
  if (hidden.categoryIds.size) {
    extraAnd.push({ OR: [{ categoryId: null }, { categoryId: { notIn: [...hidden.categoryIds] } }] });
  }
  if (hidden.distributorIds.size) {
    extraAnd.push({ OR: [{ distributorId: null }, { distributorId: { notIn: [...hidden.distributorIds] } }] });
  }
  if (hidden.familyIds.size) {
    extraAnd.push({ OR: [{ familyId: null }, { familyId: { notIn: [...hidden.familyIds] } }] });
  }

  if (!extraAnd.length) return where;
  const base = where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : [];
  return { ...where, AND: [...base, ...extraAnd] };
}

export async function resolveShareablePriceListProducts(input: {
  filters: ShareablePriceListFilters;
  clientId?: string | null;
  limit?: number;
}) {
  let where = buildProductWhereFromFilters(input.filters);
  if (input.clientId) {
    where = await applyClientVisibilityToWhere(input.clientId, where);
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ brand: { name: "asc" } }, { normalizedName: "asc" }],
    take: input.limit ?? 5000,
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      family: { select: { name: true } },
      images: { where: { isPrimary: true }, take: 1 },
    },
  });

  const globalMargin = await getGlobalMarginPercent();
  const prices = await calculatePricesForProducts(
    products.map((p) => ({
      productId: p.id,
      baseCostUsd: Number(p.baseCostUsd),
      brandId: p.brandId,
      distributorId: p.distributorId,
      categoryId: p.categoryId,
      familyId: p.familyId,
      productDiscountPercent: p.discountPercent ? Number(p.discountPercent) : null,
      tariffDutyPercent: p.tariffDutyPercent ? Number(p.tariffDutyPercent) : null,
    })),
    input.clientId ?? null,
    globalMargin
  );

  return products.map((p) => ({
    id: p.id,
    sku: p.internalSku,
    name: p.normalizedName,
    shortDescription: p.shortDescription,
    brandName: p.brand?.name ?? null,
    categoryName: p.category?.name ?? null,
    familyName: p.family?.name ?? null,
    stockStatus: p.stockStatus,
    stockQuantity: p.stockQuantity,
    kind: p.kind,
    imageUrl: p.images[0]?.url ?? null,
    pricing: prices.get(p.id)!,
  }));
}

export async function countShareablePriceListProducts(
  filters: ShareablePriceListFilters,
  clientId?: string | null
) {
  let where = buildProductWhereFromFilters(filters);
  if (clientId) where = await applyClientVisibilityToWhere(clientId, where);
  return prisma.product.count({ where });
}

export function shareListPublicUrl(shareSlug: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:4010";
  return `${base.replace(/\/$/, "")}/lista/${shareSlug}`;
}
