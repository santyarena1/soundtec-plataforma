import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorizedBySetupToken(req: NextRequest): boolean {
  const token = req.headers.get("x-setup-token");
  const expected = process.env.SETUP_TOKEN;
  return !!expected && token === expected;
}

interface SkuToPortalEntry {
  sku: string;
  portalId: string;
  brand: string;
}

interface PayloadIndex {
  totalProducts: number;
  totalChunks: number;
  skuToPortalId: SkuToPortalEntry[];
}

async function loadPayloadIndex(): Promise<PayloadIndex | null> {
  const raw = await getSetting("sonance.sync_index", "");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PayloadIndex;
  } catch {
    return null;
  }
}

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
 * Re-asigna brandId a los productos en BD usando la fuente de verdad
 * canónica: el índice persistido del último sync (sonance.sync_index).
 *
 * El índice tiene { sku, portalId, brand } donde brand es la marca top-level
 * del listing Sonance (SONANCE, BLAZE BY SONANCE, TRUFIG, APPAREL, IPORT, JAMES).
 *
 * Útil cuando el apply-mapping inicial corrió antes de que __sourceBrand
 * existiera y los productos quedaron mal asignados.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isAuthorizedBySetupToken(req)) {
      await requireAdmin();
    }

    const idx = await loadPayloadIndex();
    if (!idx || !Array.isArray(idx.skuToPortalId) || idx.skuToPortalId.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No hay índice de sync persistido. Re-sincronizá desde /admin/sonance-import primero.",
        },
        { status: 400 }
      );
    }

    // Resolver brand ids necesarios
    const uniqueBrands = Array.from(new Set(idx.skuToPortalId.map((it) => it.brand).filter(Boolean)));
    const brandIdByName = new Map<string, string>();
    for (const name of uniqueBrands) {
      brandIdByName.set(name, await ensureBrandId(name));
    }

    // Build sku → expected brand id desde el índice
    const skuToBrandId = new Map<string, string>();
    for (const it of idx.skuToPortalId) {
      const id = brandIdByName.get(it.brand);
      if (id) skuToBrandId.set(it.sku, id);
    }

    // Procesamos en lotes para no traer 2k+ rows de una vez
    const allSkus = Array.from(skuToBrandId.keys());
    const BATCH = 500;
    let scanned = 0;
    let updated = 0;
    const perBrand: Record<string, number> = {};

    for (let s = 0; s < allSkus.length; s += BATCH) {
      const slice = allSkus.slice(s, s + BATCH);
      const products = await prisma.product.findMany({
        where: { supplierSku: { in: slice } },
        select: { id: true, supplierSku: true, brandId: true },
      });
      scanned += products.length;

      for (const p of products) {
        if (!p.supplierSku) continue;
        const targetBrandId = skuToBrandId.get(p.supplierSku);
        if (!targetBrandId) continue;
        if (p.brandId === targetBrandId) continue;
        await prisma.product.update({
          where: { id: p.id },
          data: { brandId: targetBrandId },
        });
        // Tracking de qué marca recibió cada update (para el reporte)
        const brandName = uniqueBrands.find((n) => brandIdByName.get(n) === targetBrandId) ?? "(?)";
        perBrand[brandName] = (perBrand[brandName] ?? 0) + 1;
        updated++;
      }
    }

    return NextResponse.json({
      ok: true,
      indexSize: idx.skuToPortalId.length,
      scanned,
      updated,
      perBrand,
      message: `${updated} productos re-asignados sobre ${scanned} escaneados (${idx.skuToPortalId.length} en el índice).`,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
