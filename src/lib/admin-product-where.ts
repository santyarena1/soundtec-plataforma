import type { Prisma, StockStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildProductSearchAnd } from "@/lib/product-search";
import type { AdminProductFilters } from "@/lib/admin-product-filters";

/** Productos Crestron cuyo enriquecimiento falló (no existen en crestron.com). */
export const CRESTRON_MISSING_WHERE: Prisma.ProductWhereInput = {
  brand: { name: { equals: "CRESTRON", mode: "insensitive" } },
  sourceMetadata: { path: ["crestronCom", "error"], string_contains: "" },
};

export async function buildAdminProductWhere(f: AdminProductFilters): Promise<Prisma.ProductWhereInput> {
  const feedbackIds = f.feedback
    ? (
        await prisma.aiContentFeedback.groupBy({
          by: ["refId"],
          where: { type: "PRODUCT_DESCRIPTION", verdict: "HAS_ERRORS", resolvedAt: null },
        })
      ).map((row) => row.refId)
    : null;
  const search = f.q ? buildProductSearchAnd(f.q) : null;
  return {
    ...(feedbackIds ? { id: { in: feedbackIds } } : {}),
    ...(f.crestronMissing ? CRESTRON_MISSING_WHERE : {}),
    ...(f.brandIds.length ? { brandId: { in: f.brandIds } } : {}),
    ...(f.categoryIds.length ? { categoryId: { in: f.categoryIds } } : {}),
    ...(f.familyIds.length ? { familyId: { in: f.familyIds } } : {}),
    ...(f.distributorIds.length ? { distributorId: { in: f.distributorIds } } : {}),
    ...(f.stockStatuses.length ? { stockStatus: { in: f.stockStatuses as StockStatus[] } } : {}),
    ...(f.active ? { isActive: f.active === "yes" } : {}),
    ...(f.nocat ? { categoryId: null } : {}),
    ...(f.noimg ? { images: { none: {} } } : {}),
    ...(f.nodesc ? { longDescription: null } : {}),
    ...(f.crestron ? { isCrestronHomeCompatible: true } : {}),
    ...(search?.length ? { AND: search } : {}),
  };
}

