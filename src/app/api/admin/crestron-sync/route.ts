import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  fetchCrestronPriceList,
  toCrestronStockStatus,
} from "@/services/crestron-sync";
import { revalidatePath } from "next/cache";

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
  currentStockStatus: string | null;
  priceChanged: boolean;
  stockChanged: boolean;
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
      },
    });

    const byCode = new Map(products.map((p) => [p.internalSku, p]));

    const items: SyncPreviewItem[] = crestronItems.map((item) => {
      const product = byCode.get(item.ItemCode) ?? null;
      const newPrice = item.Price;
      const newStock = toCrestronStockStatus(item);
      const curPrice = product ? Number(product.baseCostUsd) : null;

      return {
        itemCode: item.ItemCode,
        itemName: item.ItemName,
        currency: item.Currency,
        category: item.Gpo,
        laredo: item["07"] ?? "—",
        miami: item["11"] ?? "—",
        factoryInfo: item.U_ETDCUS ?? "",
        newPrice,
        newStockStatus: newStock,
        matched: product !== null,
        productId: product?.id ?? null,
        productName: product?.normalizedName ?? null,
        currentPrice: curPrice,
        currentStockStatus: product?.stockStatus ?? null,
        priceChanged: curPrice !== null && curPrice !== newPrice,
        stockChanged:
          product !== null && product.stockStatus !== newStock,
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

      await prisma.product.update({
        where: { id: product.id },
        data: {
          baseCostUsd: item.Price,
          stockStatus: toCrestronStockStatus(item),
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
