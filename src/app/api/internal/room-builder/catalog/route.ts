import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeRoomBuilderBridge } from "@/lib/room-builder-bridge-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PAGE = 100;
const DEFAULT_PAGE = 50;

function jsonCount(value: unknown): number {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.length;
  return 1;
}

function hasNonEmptyJson(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

/**
 * Read-only catalog bridge for Room Builder bootstrap.
 *
 * GET /api/internal/room-builder/catalog?view=summary
 * GET /api/internal/room-builder/catalog?view=brands
 * GET /api/internal/room-builder/catalog?view=types
 * GET /api/internal/room-builder/catalog?view=products&page=1&pageSize=50&brand=&q=&hasSpecs=1&hasDocs=1&hasAi=1
 * GET /api/internal/room-builder/catalog?view=product&id=<productId>
 *
 * Auth: Authorization: Bearer <ROOM_BUILDER_BRIDGE_SECRET>
 */
export async function GET(req: NextRequest) {
  const denied = authorizeRoomBuilderBridge(req);
  if (denied) return denied;

  const view = req.nextUrl.searchParams.get("view") ?? "summary";

  try {
    if (view === "summary") {
      const [
        productTotal,
        productActive,
        withSpecs,
        withDocs,
        withVendorUrl,
        withDimensions,
        withAiProfile,
        brandCount,
        categoryCount,
        byBrand,
        byAiType,
        byStock,
      ] = await Promise.all([
        prisma.product.count(),
        prisma.product.count({ where: { isActive: true } }),
        prisma.product.count({
          where: { specifications: { not: Prisma.DbNull } },
        }),
        prisma.product.count({
          where: { documents: { not: Prisma.DbNull } },
        }),
        prisma.product.count({
          where: { vendorProductUrl: { not: null } },
        }),
        prisma.product.count({
          where: {
            OR: [
              { widthCm: { not: null } },
              { heightCm: { not: null } },
              { depthCm: { not: null } },
              { weight: { not: null } },
            ],
          },
        }),
        prisma.productAiProfile.count(),
        prisma.brand.count(),
        prisma.category.count(),
        prisma.product.groupBy({
          by: ["brandId"],
          _count: { _all: true },
          where: { isActive: true },
          orderBy: { _count: { brandId: "desc" } },
          take: 40,
        }),
        prisma.productAiProfile.groupBy({
          by: ["productType"],
          _count: { _all: true },
          orderBy: { _count: { productType: "desc" } },
        }),
        prisma.product.groupBy({
          by: ["stockStatus"],
          _count: { _all: true },
          where: { isActive: true },
        }),
      ]);

      const brandIds = byBrand
        .map((row) => row.brandId)
        .filter((id): id is string => !!id);
      const brands = await prisma.brand.findMany({
        where: { id: { in: brandIds } },
        select: { id: true, name: true, slug: true, isActive: true },
      });
      const brandMap = new Map(brands.map((b) => [b.id, b]));

      return NextResponse.json({
        ok: true,
        view: "summary",
        generatedAt: new Date().toISOString(),
        totals: {
          products: productTotal,
          productsActive: productActive,
          withSpecifications: withSpecs,
          withDocuments: withDocs,
          withVendorProductUrl: withVendorUrl,
          withPhysicalDimensions: withDimensions,
          withAiProfile,
          brands: brandCount,
          categories: categoryCount,
        },
        byBrand: byBrand.map((row) => ({
          brandId: row.brandId,
          brandName: row.brandId
            ? brandMap.get(row.brandId)?.name ?? null
            : null,
          brandSlug: row.brandId
            ? brandMap.get(row.brandId)?.slug ?? null
            : null,
          count: row._count._all,
        })),
        byAiProductType: byAiType.map((row) => ({
          productType: row.productType,
          count: row._count._all,
        })),
        byStockStatus: byStock.map((row) => ({
          stockStatus: row.stockStatus,
          count: row._count._all,
        })),
      });
    }

    if (view === "brands") {
      const brands = await prisma.brand.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          hiddenFromCatalog: true,
          _count: { select: { products: true } },
        },
      });
      return NextResponse.json({
        ok: true,
        view: "brands",
        count: brands.length,
        brands: brands.map((b) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          isActive: b.isActive,
          hiddenFromCatalog: b.hiddenFromCatalog,
          productCount: b._count.products,
        })),
      });
    }

    if (view === "types") {
      const types = await prisma.productAiProfile.groupBy({
        by: ["productType"],
        _count: { _all: true },
        orderBy: { _count: { productType: "desc" } },
      });
      const mountSamples = await prisma.productAiProfile.findMany({
        where: { mountTypes: { isEmpty: false } },
        select: { mountTypes: true },
        take: 500,
      });
      const mountFreq = new Map<string, number>();
      for (const row of mountSamples) {
        for (const m of row.mountTypes) {
          mountFreq.set(m, (mountFreq.get(m) ?? 0) + 1);
        }
      }
      return NextResponse.json({
        ok: true,
        view: "types",
        productTypes: types.map((t) => ({
          productType: t.productType,
          count: t._count._all,
        })),
        mountTypesSampled: [...mountFreq.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([mountType, count]) => ({ mountType, count })),
      });
    }

    if (view === "products") {
      const page = Math.max(
        1,
        Number(req.nextUrl.searchParams.get("page") ?? "1") || 1
      );
      const pageSize = Math.min(
        MAX_PAGE,
        Math.max(
          1,
          Number(req.nextUrl.searchParams.get("pageSize") ?? String(DEFAULT_PAGE)) ||
            DEFAULT_PAGE
        )
      );
      const brand = req.nextUrl.searchParams.get("brand")?.trim() || undefined;
      const q = req.nextUrl.searchParams.get("q")?.trim() || undefined;
      const productType =
        req.nextUrl.searchParams.get("productType")?.trim() || undefined;
      const hasSpecs = req.nextUrl.searchParams.get("hasSpecs") === "1";
      const hasDocs = req.nextUrl.searchParams.get("hasDocs") === "1";
      const hasAi = req.nextUrl.searchParams.get("hasAi") === "1";
      const hasVendorUrl =
        req.nextUrl.searchParams.get("hasVendorUrl") === "1";
      const activeOnly = req.nextUrl.searchParams.get("active") !== "0";

      const where: Prisma.ProductWhereInput = {
        ...(activeOnly ? { isActive: true } : {}),
        ...(brand
          ? {
              brand: {
                OR: [
                  { slug: { equals: brand, mode: "insensitive" as const } },
                  { name: { equals: brand, mode: "insensitive" as const } },
                ],
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { normalizedName: { contains: q, mode: "insensitive" as const } },
                { originalName: { contains: q, mode: "insensitive" as const } },
                { supplierSku: { contains: q, mode: "insensitive" as const } },
                { modelNumber: { contains: q, mode: "insensitive" as const } },
                { internalSku: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(hasSpecs ? { specifications: { not: Prisma.DbNull } } : {}),
        ...(hasDocs ? { documents: { not: Prisma.DbNull } } : {}),
        ...(hasVendorUrl ? { vendorProductUrl: { not: null } } : {}),
        ...(hasAi || productType
          ? {
              aiProfile: productType
                ? { productType }
                : { isNot: null },
            }
          : {}),
      };

      const [total, rows] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          orderBy: [{ brand: { name: "asc" } }, { normalizedName: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            internalSku: true,
            supplierSku: true,
            modelNumber: true,
            normalizedName: true,
            originalName: true,
            familia: true,
            tipo: true,
            isActive: true,
            isDiscontinued: true,
            stockStatus: true,
            stockQuantity: true,
            baseCostUsd: true,
            listPriceUsd: true,
            widthCm: true,
            heightCm: true,
            depthCm: true,
            weight: true,
            vendorProductUrl: true,
            sourceCategoryPath: true,
            enrichedAt: true,
            specifications: true,
            documents: true,
            keyFeatures: true,
            brand: { select: { id: true, name: true, slug: true } },
            category: { select: { id: true, name: true, slug: true } },
            aiProfile: {
              select: {
                productType: true,
                environment: true,
                mountTypes: true,
                audioLine: true,
                powerWatts: true,
                applications: true,
                ecosystems: true,
                summaryEs: true,
                profileVersion: true,
              },
            },
            images: {
              select: { url: true, isPrimary: true, source: true },
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              take: 3,
            },
            _count: { select: { images: true } },
          },
        }),
      ]);

      return NextResponse.json({
        ok: true,
        view: "products",
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        products: rows.map((p) => ({
          id: p.id,
          internalSku: p.internalSku,
          supplierSku: p.supplierSku,
          modelNumber: p.modelNumber,
          name: p.normalizedName,
          originalName: p.originalName,
          familia: p.familia,
          tipo: p.tipo,
          isActive: p.isActive,
          isDiscontinued: p.isDiscontinued,
          stockStatus: p.stockStatus,
          stockQuantity: p.stockQuantity,
          baseCostUsd: p.baseCostUsd?.toString() ?? null,
          listPriceUsd: p.listPriceUsd?.toString() ?? null,
          widthCm: p.widthCm?.toString() ?? null,
          heightCm: p.heightCm?.toString() ?? null,
          depthCm: p.depthCm?.toString() ?? null,
          weightKg: p.weight?.toString() ?? null,
          vendorProductUrl: p.vendorProductUrl,
          sourceCategoryPath: p.sourceCategoryPath,
          enrichedAt: p.enrichedAt?.toISOString() ?? null,
          specsCount: jsonCount(p.specifications),
          docsCount: jsonCount(p.documents),
          keyFeaturesCount: jsonCount(p.keyFeatures),
          hasSpecifications: hasNonEmptyJson(p.specifications),
          hasDocuments: hasNonEmptyJson(p.documents),
          imageCount: p._count.images,
          images: p.images,
          brand: p.brand,
          category: p.category,
          aiProfile: p.aiProfile,
        })),
      });
    }

    if (view === "product") {
      const id = req.nextUrl.searchParams.get("id")?.trim();
      if (!id) {
        return NextResponse.json(
          { ok: false, error: "id is required for view=product" },
          { status: 400 }
        );
      }

      const product = await prisma.product.findUnique({
        where: { id },
        select: {
          id: true,
          internalSku: true,
          supplierSku: true,
          modelNumber: true,
          manufacturerItem: true,
          normalizedName: true,
          originalName: true,
          shortDescription: true,
          longDescription: true,
          familia: true,
          tipo: true,
          productLine: true,
          isActive: true,
          isDiscontinued: true,
          isCrestronHomeCompatible: true,
          stockStatus: true,
          stockQuantity: true,
          baseCostUsd: true,
          listPriceUsd: true,
          widthCm: true,
          heightCm: true,
          depthCm: true,
          weight: true,
          volume: true,
          vendorProductUrl: true,
          urlSlug: true,
          sourceCategoryPath: true,
          regulatoryModel: true,
          enrichedAt: true,
          translatedAt: true,
          specifications: true,
          documents: true,
          keyFeatures: true,
          badges: true,
          brand: { select: { id: true, name: true, slug: true } },
          category: { select: { id: true, name: true, slug: true } },
          family: { select: { id: true, name: true, slug: true } },
          aiProfile: true,
          images: {
            select: {
              id: true,
              url: true,
              alt: true,
              source: true,
              isPrimary: true,
            },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
        },
      });

      if (!product) {
        return NextResponse.json(
          { ok: false, error: "Product not found" },
          { status: 404 }
        );
      }

      const { aiProfile, ...rest } = product;
      return NextResponse.json({
        ok: true,
        view: "product",
        product: {
          ...rest,
          baseCostUsd: rest.baseCostUsd?.toString() ?? null,
          listPriceUsd: rest.listPriceUsd?.toString() ?? null,
          widthCm: rest.widthCm?.toString() ?? null,
          heightCm: rest.heightCm?.toString() ?? null,
          depthCm: rest.depthCm?.toString() ?? null,
          weightKg: rest.weight?.toString() ?? null,
          volumeM3: rest.volume?.toString() ?? null,
          // Strip embedding blob — useless over the wire and huge.
          aiProfile: aiProfile
            ? {
                ...aiProfile,
                embedding: undefined,
                embeddingDims: aiProfile.embedding?.length ?? 0,
              }
            : null,
        },
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unknown view. Use summary | brands | types | products | product",
      },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
