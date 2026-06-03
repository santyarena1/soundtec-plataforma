import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isAuthorizedBySetupToken(req: NextRequest): boolean {
  const token = req.headers.get("x-setup-token");
  const expected = process.env.SETUP_TOKEN;
  return !!expected && token === expected;
}

/**
 * Diagnóstico crudo de qué productos hay en la BD para entender por qué el
 * backfill por keyword no matcheaba. Devuelve:
 *  - Sample de 10 productos con ILIKE %blaze% en CUALQUIER campo de texto
 *  - Idem para trufig, apparel
 *  - Conteo total de productos por marca actual
 */
export async function GET(req: NextRequest) {
  try {
    if (!isAuthorizedBySetupToken(req)) {
      await requireAdmin();
    }

    const keywords = ["blaze", "trufig", "apparel", "iport", "james"];
    const result: Record<string, unknown> = {};

    for (const kw of keywords) {
      const matches = await prisma.product.findMany({
        where: {
          OR: [
            { normalizedName: { contains: kw, mode: "insensitive" } },
            { originalName: { contains: kw, mode: "insensitive" } },
            { supplierSku: { contains: kw, mode: "insensitive" } },
            { internalSku: { contains: kw, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          normalizedName: true,
          originalName: true,
          supplierSku: true,
          brand: { select: { name: true } },
        },
        take: 10,
      });
      const total = await prisma.product.count({
        where: {
          OR: [
            { normalizedName: { contains: kw, mode: "insensitive" } },
            { originalName: { contains: kw, mode: "insensitive" } },
            { supplierSku: { contains: kw, mode: "insensitive" } },
            { internalSku: { contains: kw, mode: "insensitive" } },
          ],
        },
      });
      result[kw] = { total, sample: matches };
    }

    // Brand counts
    const brandStats = await prisma.brand.findMany({
      select: {
        name: true,
        _count: { select: { products: true } },
      },
      orderBy: { name: "asc" },
    });
    result.brandsInDb = brandStats.map((b) => ({ name: b.name, count: b._count.products }));

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
