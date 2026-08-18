import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  fetchProductsBySearch,
  fetchProductDetailRawOrThrow,
  fetchSkusBySearch,
  findProductIdBySku,
  openSession,
  type Session,
} from "@/services/sonance-portal";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function inspectTerm(session: Session, term: string) {
  const skus = await fetchSkusBySearch(session, term);
  const detailResults = await Promise.all(
    skus.slice(0, 5).map(async (sku) => {
      try {
        const portalId = await findProductIdBySku(session, sku);
        if (!portalId) return null;
        return await fetchProductDetailRawOrThrow(session, portalId);
      } catch {
        return null;
      }
    })
  );
  const sampleBrandNames = [...new Set(
    detailResults
      .map((detail) => detail?.brand?.name?.trim())
      .filter((name): name is string => !!name)
  )];
  return {
    count: skus.length,
    sampleSkus: skus.slice(0, 10),
    sampleBrandNames,
  };
}

async function inspectBlaze(session: Session) {
  const blazeSkus = await fetchSkusBySearch(session, "blaze");
  const [productsBySearch, dbProducts, detailResults] = await Promise.all([
    fetchProductsBySearch(session, "blaze"),
    prisma.product.findMany({
      where: { supplierSku: { in: blazeSkus } },
      select: {
        supplierSku: true,
        normalizedName: true,
        brand: { select: { name: true } },
      },
    }),
    Promise.all(
      blazeSkus.slice(0, 5).map(async (sku) => {
        try {
          const portalId = await findProductIdBySku(session, sku);
          if (!portalId) return null;
          return await fetchProductDetailRawOrThrow(session, portalId);
        } catch {
          return null;
        }
      })
    ),
  ]);

  const dbSkus = new Set(
    dbProducts
      .map((product) => product.supplierSku)
      .filter((sku): sku is string => !!sku)
  );
  const brandBreakdown: Record<string, number> = {};
  for (const product of dbProducts) {
    const brand = product.brand?.name ?? "(sin marca)";
    brandBreakdown[brand] = (brandBreakdown[brand] ?? 0) + 1;
  }
  const sampleBrandNames = [...new Set(
    detailResults
      .map((detail) => detail?.brand?.name?.trim())
      .filter((name): name is string => !!name)
  )];

  return {
    count: blazeSkus.length,
    portalCount: blazeSkus.length,
    productsBySearchCount: productsBySearch.length,
    inDbCount: dbSkus.size,
    brandBreakdown,
    missingSkus: blazeSkus.filter((sku) => !dbSkus.has(sku)).slice(0, 10),
    sampleTaggedWrong: dbProducts
      .filter((product) => product.brand?.name !== "BLAZE BY SONANCE")
      .slice(0, 8)
      .map((product) => ({
        supplierSku: product.supplierSku,
        brand: product.brand?.name ?? "(sin marca)",
      })),
    sampleSkus: blazeSkus.slice(0, 10),
    sampleBrandNames,
  };
}

export async function GET() {
  try {
    await requireAdmin();
    const session = await openSession();
    const [blaze, apparel] = await Promise.all([
      inspectBlaze(session),
      inspectTerm(session, "apparel"),
    ]);
    return NextResponse.json({ ok: true, results: { blaze, apparel } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      results: {
        blaze: {
          count: 0,
          portalCount: 0,
          productsBySearchCount: 0,
          inDbCount: 0,
          brandBreakdown: {},
          missingSkus: [],
          sampleTaggedWrong: [],
          sampleSkus: [],
          sampleBrandNames: [],
        },
        apparel: { count: 0, sampleSkus: [], sampleBrandNames: [] },
      },
    });
  }
}
