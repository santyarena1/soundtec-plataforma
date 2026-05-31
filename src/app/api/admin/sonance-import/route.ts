import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { parseSonanceExcel, type SonanceProduct } from "@/services/sonance-import";
import { revalidatePath } from "next/cache";

export interface SonancePreviewItem {
  supplierSku: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  uom: string;
  newPrice: number;
  // existing product info (null if no match)
  productId: string | null;
  productName: string | null;
  currentPrice: number | null;
  priceChanged: boolean;
  isNew: boolean; // true = not in DB yet
}

export interface SonancePreviewResponse {
  ok: boolean;
  error?: string;
  fileType?: string;
  totalParsed?: number;
  matched?: number;
  newProducts?: number;
  priceChanges?: number;
  brandCounts?: Record<string, number>;
  items?: SonancePreviewItem[];
}

// POST /api/admin/sonance-import — parse uploaded file, return preview
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ ok: false, error: "No se recibió archivo" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSonanceExcel(buffer);

    const skus = parsed.products.map((p) => p.supplierSku);
    const existing = await prisma.product.findMany({
      where: { supplierSku: { in: skus } },
      select: {
        id: true,
        supplierSku: true,
        normalizedName: true,
        baseCostUsd: true,
      },
    });
    const bySkuMap = new Map(existing.map((p) => [p.supplierSku, p]));

    const items: SonancePreviewItem[] = parsed.products.map((p) => {
      const match = p.supplierSku ? bySkuMap.get(p.supplierSku) ?? null : null;
      const curPrice = match ? Number(match.baseCostUsd) : null;
      return {
        supplierSku: p.supplierSku,
        name: p.name,
        brand: p.brand,
        category: p.category,
        subcategory: p.subcategory,
        uom: p.uom,
        newPrice: p.price,
        productId: match?.id ?? null,
        productName: match?.normalizedName ?? null,
        currentPrice: curPrice,
        priceChanged: curPrice !== null && curPrice !== p.price,
        isNew: match === null,
      };
    });

    const matched = items.filter((i) => !i.isNew);
    const newProducts = items.filter((i) => i.isNew);
    const priceChanges = matched.filter((i) => i.priceChanged);

    return NextResponse.json({
      ok: true,
      fileType: parsed.fileType,
      totalParsed: parsed.products.length,
      matched: matched.length,
      newProducts: newProducts.length,
      priceChanges: priceChanges.length,
      brandCounts: parsed.brandCounts,
      items,
    } satisfies SonancePreviewResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error } satisfies SonancePreviewResponse, { status: 500 });
  }
}

// PUT /api/admin/sonance-import — apply: update prices for matched, optionally create new
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();

    const { items, createNew }: { items: SonancePreviewItem[]; createNew: boolean } =
      await req.json();

    // Resolve brand IDs once
    const brandNames = [...new Set(items.map((i) => i.brand))];
    const brands = await prisma.brand.findMany({
      where: { name: { in: brandNames } },
      select: { id: true, name: true },
    });
    const brandIdMap = new Map(brands.map((b) => [b.name, b.id]));

    let updated = 0;
    let created = 0;

    for (const item of items) {
      if (!item.isNew) {
        // Update price only
        if (item.productId && item.priceChanged) {
          await prisma.product.update({
            where: { id: item.productId },
            data: { baseCostUsd: item.newPrice },
          });
          updated++;
        }
      } else if (createNew) {
        const brandId = brandIdMap.get(item.brand) ?? null;
        await prisma.product.create({
          data: {
            normalizedName: item.name,
            originalName: item.name,
            supplierSku: item.supplierSku,
            baseCostUsd: item.newPrice,
            brandId,
            familia: item.category || null,
            tipo: item.subcategory || null,
            isActive: false, // requires manual review before publishing
          },
        });
        created++;
      }
    }

    revalidatePath("/admin/products");
    revalidatePath("/portal/products");
    revalidatePath("/admin/sonance-import");

    return NextResponse.json({ ok: true, updated, created });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
