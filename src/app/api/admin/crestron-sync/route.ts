import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  fetchCrestronPriceList,
  toCrestronStockStatus,
} from "@/services/crestron-sync";
import { revalidatePath } from "next/cache";

// Crestron sync paginates through ~1400 items via DataTables — needs > default 10s
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export interface SyncPreviewItem {
  itemCode: string;
  itemName: string;
  currency: string;
  category: string;
  laredo: string;
  miami: string;
  factoryInfo: string;
  newPrice: number;
  newStockStatus: string;
  matched: boolean;
  productId: string | null;
  productName: string | null;
  currentPrice: number | null;
  currentCategory: string | null;
  currentStockStatus: string | null;
  priceChanged: boolean;
  stockChanged: boolean;
  categoryChanged: boolean;
}

export interface SyncPreviewResponse {
  ok: boolean;
  error?: string;
  fetchedAt?: string;
  total?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  priceChanges?: number;
  stockChanges?: number;
  categoryChanges?: number;
  items?: SyncPreviewItem[];
}

// GET → preview (fetch Crestron data and diff against DB, nothing is saved)
export async function GET() {
  try {
    await requireAdmin();

    const crestronItems = await fetchCrestronPriceList();

    const skus = crestronItems
      .map((i) => i.ItemCode)
      .filter((s): s is string => Boolean(s));

    const products = await prisma.product.findMany({
      where: { internalSku: { in: skus } },
      select: {
        id: true,
        internalSku: true,
        normalizedName: true,
        baseCostUsd: true,
        stockStatus: true,
        familia: true,
      },
    });

    const byCode = new Map(products.map((p) => [p.internalSku, p]));

    const items: SyncPreviewItem[] = crestronItems.map((item) => {
      const product = byCode.get(item.ItemCode) ?? null;
      const newPrice = item.Price;
      const newStock = toCrestronStockStatus(item);
      const newCategory = (item.Gpo ?? "").trim();
      const curPrice = product ? Number(product.baseCostUsd) : null;
      const curCategory = product?.familia ?? null;

      return {
        itemCode: item.ItemCode,
        itemName: item.ItemName,
        currency: item.Currency,
        category: newCategory,
        laredo: item["07"] ?? "—",
        miami: item["11"] ?? "—",
        factoryInfo: item.U_ETDCUS ?? "",
        newPrice,
        newStockStatus: newStock,
        matched: product !== null,
        productId: product?.id ?? null,
        productName: product?.normalizedName ?? null,
        currentPrice: curPrice,
        currentCategory: curCategory,
        currentStockStatus: product?.stockStatus ?? null,
        priceChanged: curPrice !== null && curPrice !== newPrice,
        stockChanged:
          product !== null && product.stockStatus !== newStock,
        categoryChanged:
          product !== null && newCategory.length > 0 && (curCategory ?? "") !== newCategory,
      };
    });

    const matched = items.filter((i) => i.matched);

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      total: crestronItems.length,
      matchedCount: matched.length,
      unmatchedCount: items.length - matched.length,
      priceChanges: matched.filter((i) => i.priceChanged).length,
      stockChanges: matched.filter((i) => i.stockChanged).length,
      categoryChanges: matched.filter((i) => i.categoryChanged).length,
      items,
    } satisfies SyncPreviewResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error } satisfies SyncPreviewResponse, {
      status: 500,
    });
  }
}

// POST → apply changes (updates baseCostUsd and stockStatus for matched products)
export async function POST() {
  try {
    await requireAdmin();

    const crestronItems = await fetchCrestronPriceList();
    const skus = crestronItems
      .map((i) => i.ItemCode)
      .filter((s): s is string => Boolean(s));

    const products = await prisma.product.findMany({
      where: { internalSku: { in: skus } },
      select: { id: true, internalSku: true },
    });

    const byCode = new Map(products.map((p) => [p.internalSku, p]));
    let updated = 0;

    for (const item of crestronItems) {
      const product = byCode.get(item.ItemCode);
      if (!product) continue;

      const newCategory = (item.Gpo ?? "").trim();
      await prisma.product.update({
        where: { id: product.id },
        data: {
          baseCostUsd: item.Price,
          stockStatus: toCrestronStockStatus(item),
          ...(newCategory ? { familia: newCategory } : {}),
        },
      });
      updated++;
    }

    revalidatePath("/admin/products");
    revalidatePath("/portal/products");

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
