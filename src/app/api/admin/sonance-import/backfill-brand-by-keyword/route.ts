import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorizedBySetupToken(req: NextRequest): boolean {
  const token = req.headers.get("x-setup-token");
  const expected = process.env.SETUP_TOKEN;
  return !!expected && token === expected;
}

const BRAND_KEYWORDS: Array<{ test: RegExp; brand: string }> = [
  { test: /\bblaze\b/i, brand: "BLAZE BY SONANCE" },
  { test: /\btrufig\b/i, brand: "TRUFIG" },
  { test: /\bapparel\b/i, brand: "APPAREL" },
  { test: /\biport\b/i, brand: "IPORT" },
  { test: /\bjames\b/i, brand: "JAMES" },
];

async function ensureBrandId(name: string): Promise<string> {
  const existing = await prisma.brand.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.brand.create({
    data: { name, slug: slugify(name) },
    select: { id: true },
  });
  return created.id;
}

/**
 * Re-asigna brand a los productos ya importados según keywords en el nombre,
 * SKU, modelNumber o manufacturerItem.
 *
 * Casos típicos:
 *  - Productos cargados como SONANCE pero el nombre dice "BLAZE" → BLAZE BY SONANCE.
 *  - Productos cargados como SONANCE pero el SKU empieza con TRUFIG → TRUFIG.
 *
 * NO desasigna marcas (si no hay match, deja el brand actual). Solo escribe
 * cuando hay un match claro y la marca actual NO es la marca correcta inferida.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isAuthorizedBySetupToken(req)) {
      await requireAdmin();
    }

    // Cache de brand ids para evitar query repetidas
    const brandIdByName = new Map<string, string>();
    for (const { brand } of BRAND_KEYWORDS) {
      brandIdByName.set(brand, await ensureBrandId(brand));
    }

    // Traemos todos los productos con sus campos relevantes en batches
    const PAGE = 500;
    let cursor: string | undefined = undefined;
    let scanned = 0;
    let updated = 0;
    const summary: Record<string, number> = {};

    while (true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const products: any[] = await prisma.product.findMany({
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: PAGE,
        orderBy: { id: "asc" },
        select: {
          id: true,
          brandId: true,
          normalizedName: true,
          originalName: true,
          supplierSku: true,
          internalSku: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
      if (products.length === 0) break;
      cursor = products[products.length - 1].id;
      scanned += products.length;

      // También leemos los campos modelNumber/manufacturerItem (recién agregados)
      const enriched = await prisma.product.findMany({
        where: { id: { in: products.map((p) => p.id) } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        select: {
          id: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
      // Nota: si modelNumber/manufacturerItem no están en el schema, el select
      // anterior falla. Caemos a un query raw mínimo.
      const richMap = new Map<string, { modelNumber?: string | null; manufacturerItem?: string | null }>();
      try {
        const richRows = await prisma.$queryRawUnsafe<
          Array<{ id: string; modelNumber: string | null; manufacturerItem: string | null }>
        >(
          `SELECT id, "modelNumber", "manufacturerItem" FROM "Product" WHERE id = ANY($1)`,
          products.map((p) => p.id)
        );
        for (const r of richRows) {
          richMap.set(r.id, { modelNumber: r.modelNumber, manufacturerItem: r.manufacturerItem });
        }
      } catch {
        /* columnas no existen — ignoramos */
      }
      void enriched;

      for (const p of products) {
        const rich = richMap.get(p.id) || {};
        const haystack = [
          p.normalizedName,
          p.originalName,
          p.supplierSku,
          p.internalSku,
          rich.modelNumber,
          rich.manufacturerItem,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack) continue;
        let inferred: string | null = null;
        for (const { test, brand } of BRAND_KEYWORDS) {
          if (test.test(haystack)) {
            inferred = brand;
            break;
          }
        }
        if (!inferred) continue;
        const targetBrandId = brandIdByName.get(inferred);
        if (!targetBrandId) continue;
        if (p.brandId === targetBrandId) continue;

        await prisma.product.update({
          where: { id: p.id },
          data: { brandId: targetBrandId },
        });
        updated++;
        summary[inferred] = (summary[inferred] ?? 0) + 1;
      }

      if (products.length < PAGE) break;
    }

    return NextResponse.json({
      ok: true,
      scanned,
      updated,
      perBrand: summary,
      message: `${updated} productos re-asignados sobre ${scanned} escaneados.`,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
