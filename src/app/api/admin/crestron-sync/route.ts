import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getSetting, setSetting } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import {
  fetchCrestronPriceList,
  toCrestronStockStatus,
} from "@/services/crestron-sync";
import { revalidatePath } from "next/cache";

// Crestron sync paginates through ~1400 items via DataTables — needs > default 10s
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export type CategoryTarget = "categoria" | "familia" | "rubro" | "subrubro";

const TARGET_KEY = "crestron.category_target";
const TRANSLATIONS_KEY = "crestron.category_translations";

export interface SyncPreviewItem {
  itemCode: string;
  itemName: string;
  currency: string;
  category: string; // raw EN value from Crestron (Gpo)
  laredo: string;
  miami: string;
  factoryInfo: string;
  newPrice: number;
  newStockStatus: string;
  matched: boolean;
  productId: string | null;
  productName: string | null;
  currentPrice: number | null;
  currentCategoryLabel: string | null;
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
  uniqueCategories?: string[]; // unique EN values found in Crestron
  translations?: Record<string, string>; // saved EN → ES map
  target?: CategoryTarget;
}

async function loadTranslations(): Promise<Record<string, string>> {
  const raw = await getSetting(TRANSLATIONS_KEY, "{}");
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function loadTarget(): Promise<CategoryTarget> {
  const raw = await getSetting(TARGET_KEY, "rubro");
  return (["categoria", "familia", "rubro", "subrubro"].includes(raw) ? raw : "rubro") as CategoryTarget;
}

function categoryLabelFor(target: CategoryTarget, product: {
  categoryName: string | null;
  familyName: string | null;
  familia: string | null;
  tipo: string | null;
}): string | null {
  if (target === "categoria") return product.categoryName;
  if (target === "familia") return product.familyName;
  if (target === "rubro") return product.familia;
  return product.tipo;
}

// GET → preview (fetch Crestron data and diff against DB, nothing is saved)
export async function GET() {
  try {
    await requireAdmin();

    const [target, translations, crestronItems] = await Promise.all([
      loadTarget(),
      loadTranslations(),
      fetchCrestronPriceList(),
    ]);

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
        tipo: true,
        category: { select: { name: true } },
        family: { select: { name: true } },
      },
    });

    const byCode = new Map(products.map((p) => [p.internalSku, p]));

    const items: SyncPreviewItem[] = crestronItems.map((item) => {
      const product = byCode.get(item.ItemCode) ?? null;
      const newPrice = item.Price;
      const newStock = toCrestronStockStatus(item);
      const newCategory = (item.Gpo ?? "").trim();
      const curPrice = product ? Number(product.baseCostUsd) : null;
      const currentLabel = product
        ? categoryLabelFor(target, {
            categoryName: product.category?.name ?? null,
            familyName: product.family?.name ?? null,
            familia: product.familia,
            tipo: product.tipo,
          })
        : null;

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
        currentCategoryLabel: currentLabel,
        currentStockStatus: product?.stockStatus ?? null,
        priceChanged: curPrice !== null && curPrice !== newPrice,
        stockChanged: product !== null && product.stockStatus !== newStock,
      };
    });

    const matched = items.filter((i) => i.matched);
    const uniqueCategories = Array.from(
      new Set(crestronItems.map((i) => (i.Gpo ?? "").trim()).filter((c) => c.length > 0))
    ).sort();

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      total: crestronItems.length,
      matchedCount: matched.length,
      unmatchedCount: items.length - matched.length,
      priceChanges: matched.filter((i) => i.priceChanged).length,
      stockChanges: matched.filter((i) => i.stockChanged).length,
      items,
      uniqueCategories,
      translations,
      target,
    } satisfies SyncPreviewResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error } satisfies SyncPreviewResponse, {
      status: 500,
    });
  }
}

// Upsert helpers for FK targets — find existing by case-insensitive name or create
async function upsertCategoryByName(name: string): Promise<string> {
  const normalized = name.trim();
  const existing = await prisma.category.findFirst({
    where: { name: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { name: normalized, slug: slugify(normalized) },
    select: { id: true },
  });
  return created.id;
}

async function upsertFamilyByName(name: string): Promise<string> {
  const normalized = name.trim();
  const existing = await prisma.productFamily.findFirst({
    where: { name: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.productFamily.create({
    data: { name: normalized, slug: slugify(normalized) },
    select: { id: true },
  });
  return created.id;
}

// POST → apply changes. Body: { translations, target }
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = (await req.json().catch(() => ({}))) as {
      translations?: Record<string, string>;
      target?: CategoryTarget;
    };
    const target = (
      ["categoria", "familia", "rubro", "subrubro"].includes(body.target ?? "")
        ? body.target
        : await loadTarget()
    ) as CategoryTarget;
    const translations = body.translations ?? (await loadTranslations());

    // Persist for next sync
    await Promise.all([
      setSetting(TARGET_KEY, target),
      setSetting(TRANSLATIONS_KEY, JSON.stringify(translations)),
    ]);

    const crestronItems = await fetchCrestronPriceList();
    const skus = crestronItems
      .map((i) => i.ItemCode)
      .filter((s): s is string => Boolean(s));

    const products = await prisma.product.findMany({
      where: { internalSku: { in: skus } },
      select: { id: true, internalSku: true },
    });

    const byCode = new Map(products.map((p) => [p.internalSku, p]));

    // Pre-upsert all FK rows once (avoid race conditions inside the loop)
    const fkIdByEs = new Map<string, string>();
    if (target === "categoria" || target === "familia") {
      const uniqueEs = Array.from(
        new Set(
          crestronItems
            .map((i) => (translations[(i.Gpo ?? "").trim()] ?? "").trim())
            .filter((s) => s.length > 0)
        )
      );
      for (const esName of uniqueEs) {
        const id = target === "categoria"
          ? await upsertCategoryByName(esName)
          : await upsertFamilyByName(esName);
        fkIdByEs.set(esName, id);
      }
    }

    let updated = 0;
    let categoryWrites = 0;

    for (const item of crestronItems) {
      const product = byCode.get(item.ItemCode);
      if (!product) continue;

      const rawCategory = (item.Gpo ?? "").trim();
      const esCategory = (translations[rawCategory] ?? "").trim();

      const data: Record<string, unknown> = {
        baseCostUsd: item.Price,
        stockStatus: toCrestronStockStatus(item),
      };

      if (esCategory.length > 0) {
        if (target === "categoria") {
          const fkId = fkIdByEs.get(esCategory);
          if (fkId) { data.categoryId = fkId; categoryWrites++; }
        } else if (target === "familia") {
          const fkId = fkIdByEs.get(esCategory);
          if (fkId) { data.familyId = fkId; categoryWrites++; }
        } else if (target === "rubro") {
          data.familia = esCategory;
          categoryWrites++;
        } else if (target === "subrubro") {
          data.tipo = esCategory;
          categoryWrites++;
        }
      }

      await prisma.product.update({ where: { id: product.id }, data });
      updated++;
    }

    revalidatePath("/admin/products");
    revalidatePath("/portal/products");
    revalidatePath("/admin/crestron-sync");

    return NextResponse.json({ ok: true, updated, categoryWrites, target });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
