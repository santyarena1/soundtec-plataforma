import { expandCategoryIds } from "@/lib/category-tree";
import type { Prisma, StockStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildProductSearchAnd } from "@/lib/product-search";
import type { AdminProductFilters } from "@/lib/admin-product-filters";
import { uncategorizedProductWhere } from "@/server/uncategorized";
import { seriesFilterWhere } from "@/lib/product-lines/series-filter";

/** Productos Crestron cuyo enriquecimiento falló (no existen en crestron.com). */
export const CRESTRON_MISSING_WHERE: Prisma.ProductWhereInput = {
  brand: { name: { equals: "CRESTRON", mode: "insensitive" } },
  sourceMetadata: { path: ["crestronCom", "error"], string_contains: "" },
};

/** Tiene texto del fabricante (descripción o HTML) y nunca se tradujo. */
export const NOT_TRANSLATED_WHERE: Prisma.ProductWhereInput = {
  translatedAt: null,
  OR: [{ longDescription: { not: null } }, { htmlContent: { not: null } }],
};

/** Sin precio para el cliente: costo en cero o «a consultar». */
export const NO_PRICE_WHERE: Prisma.ProductWhereInput = { OR: [{ requiresQuote: true }, { baseCostUsd: { lte: 0 } }] };

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
  const and: Prisma.ProductWhereInput[] = [
    ...(search ?? []),
    // «Sin categorizar»: en la categoría temporal o sin rubro.
    ...(f.nocat ? [await uncategorizedProductWhere()] : []),
    ...(f.noprice ? [NO_PRICE_WHERE] : []),
    ...(f.notrans ? [NOT_TRANSLATED_WHERE] : []),
    ...(f.lineIds.length ? [seriesFilterWhere(f.lineIds)] : []),
  ];
  return {
    ...(feedbackIds ? { id: { in: feedbackIds } } : {}),
    ...(f.crestronMissing ? CRESTRON_MISSING_WHERE : {}),
    ...(f.brandIds.length ? { brandId: { in: f.brandIds } } : {}),
    // Un rubro trae también todo lo que cuelga de él en el árbol.
    ...(f.categoryIds.length ? { categoryId: { in: await expandCategoryIds(f.categoryIds) } } : {}),
    ...(f.distributorIds.length ? { distributorId: { in: f.distributorIds } } : {}),
    ...(f.stockStatuses.length ? { stockStatus: { in: f.stockStatuses as StockStatus[] } } : {}),
    ...(f.active ? { isActive: f.active === "yes" } : {}),
    ...(f.noimg ? { images: { none: {} } } : {}),
    ...(f.nodesc ? { longDescription: null } : {}),
    ...(f.noio ? { ioProfile: { is: null } } : {}),
    ...(f.crestron ? { isCrestronHomeCompatible: true } : {}),
    // Los filtros que llevan su propio OR van en AND (si no, uno pisaría al otro).
    ...(and.length ? { AND: and } : {}),
  };
}

