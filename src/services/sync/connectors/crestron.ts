import {
  fetchCrestronPriceList,
  toCrestronStockStatus,
  type CrestronItem,
} from "@/services/crestron-sync";
import type {
  NormalizedProduct,
  ProductSourceConnector,
} from "../types";

function finite(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeItem(item: CrestronItem): NormalizedProduct {
  const stockStatus = toCrestronStockStatus(item);
  const laredoAvailable = finite(item["07_available"]) ?? 0;
  const miamiAvailable = finite(item["11_available"]) ?? 0;
  const weight = finite(item.SWeight1);
  const volume = finite(item.SVolume);

  return {
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
}

export const crestronConnector: ProductSourceConnector = {
  slug: "crestron",
  displayName: "Crestron",
  source: "CRESTRON",
  matchField: "internalSku",

  async fetchNormalized() {
    const sourceItems = await fetchCrestronPriceList();
    const items = sourceItems
      .filter((item) => item.ItemCode?.trim())
      .map(normalizeItem);

    return {
      items,
      total: items.length,
      done: true,
      nextOffset: null,
      brandCounts: { CRESTRON: items.length },
    };
  },
};
