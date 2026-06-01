import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { openSession } from "@/services/sonance-portal";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sonance-import/brands
 *
 * Devuelve TODAS las categorías top-level del portal Sonance con su conteo
 * de productos. Sirve para verificar qué marcas/categorías están disponibles
 * y compararlas con las que el código de sync conoce (BRAND_SLUGS).
 */
export async function GET() {
  try {
    await requireAdmin();
    const session = await openSession();

    // Categories tree con maxDepth=1
    const catRes = await fetch(`https://my.sonance.com/api/v1/categories/?maxDepth=1`, {
      headers: {
        Accept: "application/json",
        Cookie: Object.entries(session.cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
        "User-Agent": "Mozilla/5.0 Soundtec-Sync/1.0",
      },
    });
    if (!catRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Sonance /categories devolvió HTTP ${catRes.status}` },
        { status: 500 }
      );
    }
    const catData = (await catRes.json()) as {
      categories?: Array<{ id: string; shortDescription?: string; urlSegment?: string; name?: string }>;
    };
    const cats = catData.categories ?? [];

    // Para cada una, hacer un products?categoryId=X&pageSize=1 y leer pagination.totalItemCount
    const enriched = await Promise.all(
      cats.map(async (c) => {
        try {
          const pRes = await fetch(
            `https://my.sonance.com/api/v2/products?categoryId=${c.id}&pageSize=1`,
            {
              headers: {
                Accept: "application/json",
                Cookie: Object.entries(session.cookies)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("; "),
                "User-Agent": "Mozilla/5.0 Soundtec-Sync/1.0",
              },
            }
          );
          if (!pRes.ok) {
            return {
              id: c.id,
              name: c.shortDescription ?? c.name ?? "",
              urlSegment: c.urlSegment ?? "",
              productCount: 0,
              error: `HTTP ${pRes.status}`,
            };
          }
          const pData = (await pRes.json()) as {
            pagination?: { totalItemCount?: number };
          };
          return {
            id: c.id,
            name: c.shortDescription ?? c.name ?? "",
            urlSegment: c.urlSegment ?? "",
            productCount: pData.pagination?.totalItemCount ?? 0,
          };
        } catch (e) {
          return {
            id: c.id,
            name: c.shortDescription ?? c.name ?? "",
            urlSegment: c.urlSegment ?? "",
            productCount: 0,
            error: e instanceof Error ? e.message : "unknown",
          };
        }
      })
    );

    const totalAcrossAll = enriched.reduce((sum, b) => sum + b.productCount, 0);
    const known = ["pn-sonance", "pn-iport", "pn-blaze", "pn-james", "pn-trufig"];
    const knownCount = enriched
      .filter((b) => known.includes(b.urlSegment.toLowerCase()))
      .reduce((sum, b) => sum + b.productCount, 0);

    return NextResponse.json({
      ok: true,
      brands: enriched.sort((a, b) => b.productCount - a.productCount),
      totalAcrossAll,
      knownToSyncCount: knownCount,
      unmappedBrands: enriched
        .filter((b) => b.urlSegment && !known.includes(b.urlSegment.toLowerCase()))
        .map((b) => ({ name: b.name, urlSegment: b.urlSegment, count: b.productCount })),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
