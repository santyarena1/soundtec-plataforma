import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { openSession } from "@/services/sonance-portal";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorizedBySetupToken(req: NextRequest): boolean {
  const token = req.headers.get("x-setup-token");
  const expected = process.env.SETUP_TOKEN;
  return !!expected && token === expected;
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

interface PortalCategory {
  id: string;
  name?: string;
  urlSegment?: string;
}

interface PortalListingProduct {
  id?: string;
  productNumber?: string;
}

interface PortalListingResponse {
  products?: PortalListingProduct[];
  pagination?: { totalItemCount?: number; pageSize?: number; page?: number };
}

async function sonanceGet<T>(session: { cookies: Record<string, string> }, path: string): Promise<T> {
  const res = await fetch(`https://my.sonance.com${path}`, {
    headers: {
      Accept: "application/json",
      Cookie: Object.entries(session.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
      "User-Agent": "Mozilla/5.0 Soundtec-Sync/1.0",
    },
  });
  if (!res.ok) throw new Error(`Sonance ${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Va directo al API de mySonance, lista todas las categorías top-level con
 * slug pn-*, y para CADA una pide su lista de productos.
 *
 * Por cada productNumber encontrado en una sub-marca específica (no SONANCE
 * paraguas), busca el producto en BD por supplierSku y le pone brandId al
 * brand correspondiente.
 *
 * Es la remediación más confiable para BLAZE, APPAREL y otras sub-marcas que
 * quedaron asignadas a SONANCE porque el índice persistido es viejo.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isAuthorizedBySetupToken(req)) {
      await requireAdmin();
    }

    const session = await openSession();
    const catsResp = await sonanceGet<{ categories?: PortalCategory[] }>(
      session,
      "/api/v1/categories/?maxDepth=1"
    );
    const cats = (catsResp.categories ?? []).filter((c) =>
      (c.urlSegment ?? "").toLowerCase().startsWith("pn-")
    );

    const perBrand: Record<string, { found: number; updated: number; brandId: string }> = {};

    // SONANCE es paraguas — lo procesamos PRIMERO para que las sub-marcas
    // sobrescriban después. Si no lo procesáramos, el orden no sería determinístico.
    cats.sort((a, b) => {
      const aIs = (a.urlSegment ?? "").toLowerCase() === "pn-sonance" ? 0 : 1;
      const bIs = (b.urlSegment ?? "").toLowerCase() === "pn-sonance" ? 0 : 1;
      return aIs - bIs;
    });

    for (const cat of cats) {
      const brandName = String(cat.name ?? cat.urlSegment ?? "").trim();
      if (!brandName) continue;
      const brandId = await ensureBrandId(brandName);
      perBrand[brandName] = { found: 0, updated: 0, brandId };

      // Paginar todos los productos de esta categoría
      const ALL_SKUS: string[] = [];
      let page = 1;
      const PAGE_SIZE = 200;
      while (true) {
        const data = await sonanceGet<PortalListingResponse>(
          session,
          `/api/v2/products?categoryId=${cat.id}&pageSize=${PAGE_SIZE}&page=${page}`
        );
        const productNumbers = (data.products ?? [])
          .map((p) => p.productNumber)
          .filter((s): s is string => typeof s === "string" && s.length > 0);
        ALL_SKUS.push(...productNumbers);
        const total = data.pagination?.totalItemCount ?? productNumbers.length;
        if (page * PAGE_SIZE >= total || productNumbers.length === 0) break;
        page++;
      }
      perBrand[brandName].found = ALL_SKUS.length;

      // Update brandId para los productos encontrados
      // Procesamos en batches para no hacer una query gigante
      const BATCH = 500;
      for (let s = 0; s < ALL_SKUS.length; s += BATCH) {
        const slice = ALL_SKUS.slice(s, s + BATCH);
        const result = await prisma.product.updateMany({
          where: {
            supplierSku: { in: slice },
            // Solo actualizamos si la marca actual NO es la correcta — métrica clara
            NOT: { brandId },
          },
          data: { brandId },
        });
        perBrand[brandName].updated += result.count;
      }
    }

    return NextResponse.json({
      ok: true,
      categoriesProcessed: cats.length,
      perBrand,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
