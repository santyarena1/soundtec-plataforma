import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import {
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

export async function GET() {
  try {
    await requireAdmin();
    const session = await openSession();
    const [blaze, apparel] = await Promise.all([
      inspectTerm(session, "blaze"),
      inspectTerm(session, "apparel"),
    ]);
    return NextResponse.json({ ok: true, results: { blaze, apparel } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      results: {
        blaze: { count: 0, sampleSkus: [], sampleBrandNames: [] },
        apparel: { count: 0, sampleSkus: [], sampleBrandNames: [] },
      },
    });
  }
}
