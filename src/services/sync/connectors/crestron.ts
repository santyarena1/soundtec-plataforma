import {
  fetchCrestronPriceList,
  toCrestronStockStatus,
  type CrestronItem,
} from "@/services/crestron-sync";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import type {
  NormalizedProduct,
  ProductSourceConnector,
} from "../types";

type CategoryTarget = "categoria" | "familia" | "rubro" | "subrubro";

const TARGET_KEY = "crestron.category_target";
const TRANSLATIONS_KEY = "crestron.category_translations";

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
  return (
    ["categoria", "familia", "rubro", "subrubro"].includes(raw)
      ? raw
      : "rubro"
  ) as CategoryTarget;
}

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

function finite(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeItem(
  item: CrestronItem,
  target: CategoryTarget,
  translations: Record<string, string>
): NormalizedProduct {
  const stockStatus = toCrestronStockStatus(item);
  const laredoAvailable = finite(item["07_available"]) ?? 0;
  const miamiAvailable = finite(item["11_available"]) ?? 0;
  const weight = finite(item.SWeight1);
  const volume = finite(item.SVolume);
  const rawCategory = (item.Gpo ?? "").trim();
  const esCategory = (translations[rawCategory] ?? "").trim();

  const normalized: NormalizedProduct = {
    matchField: "internalSku",
    matchValue: item.ItemCode.trim(),
    name: item.ItemName.trim() || item.ItemCode.trim(),
    baseCostUsd: finite(item.Price),
    currency: item.Currency?.trim() || undefined,
    discountPercent: finite(item.Discount),
    stockStatus,
    stockQuantity: Math.trunc(laredoAvailable) + Math.trunc(miamiAvailable),
    availabilityType: stockStatus.replaceAll("_", ""),
    availabilityMessage:
      `Laredo: ${Math.trunc(laredoAvailable)} \u00b7 Miami: ${Math.trunc(miamiAvailable)}` +
      (item.U_ETDCUS ? ` \u00b7 ETD f\u00e1brica: ${item.U_ETDCUS}` : ""),
    weight: weight !== undefined && weight > 0 ? weight : undefined,
    volume: volume !== undefined && volume > 0 ? volume : undefined,
    originalName: item.ItemName?.trim() || undefined,
    raw: item,
  };
  if (esCategory) {
    if (target === "categoria") normalized.categoryName = esCategory;
    else if (target === "familia") normalized.familyName = esCategory;
    else if (target === "rubro") normalized.familia = esCategory;
    else normalized.tipo = esCategory;
  }
  return normalized;
}

export const crestronConnector: ProductSourceConnector = {
  slug: "crestron",
  displayName: "Crestron",
  source: "CRESTRON",
  matchField: "internalSku",

  async fetchNormalized() {
    const [sourceItems, target, translations] = await Promise.all([
      fetchCrestronPriceList(),
      loadTarget(),
      loadTranslations(),
    ]);
    if (target === "categoria" || target === "familia") {
      const uniqueEs = Array.from(
        new Set(
          sourceItems
            .map((item) =>
              (translations[(item.Gpo ?? "").trim()] ?? "").trim()
            )
            .filter((name) => name.length > 0)
        )
      );
      for (const esName of uniqueEs) {
        if (target === "categoria") await upsertCategoryByName(esName);
        else await upsertFamilyByName(esName);
      }
    }
    const items = sourceItems
      .filter((item) => item.ItemCode?.trim())
      .map((item) => normalizeItem(item, target, translations));

    return {
      items,
      total: items.length,
      done: true,
      nextOffset: null,
      brandCounts: { CRESTRON: items.length },
    };
  },
};
