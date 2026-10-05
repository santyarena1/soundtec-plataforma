/**
 * Cruza una lista de Hall Research con los productos del sistema:
 * - matched: existen → solo se actualizan costo y MSRP.
 * - toCreate: SKUs nuevos → se crean con todos los datos de la lista.
 * - missing: productos de estas marcas que la lista ya no trae → decide el admin.
 */

import { skuKey, type HallPriceRow } from "./price-list";

export interface HallCatalogProduct {
  id: string;
  sku: string | null;
  name: string;
  brand: string;
  costUsd: number;
  msrpUsd: number | null;
  isActive: boolean;
}

export interface HallPriceListPlan {
  matched: Array<{ product: HallCatalogProduct; row: HallPriceRow }>;
  toCreate: HallPriceRow[];
  missing: HallCatalogProduct[];
}

export function buildHallPriceListPlan(rows: HallPriceRow[], products: HallCatalogProduct[]): HallPriceListPlan {
  const rowByKey = new Map(rows.map((row) => [skuKey(row.sku), row]));
  const matchedKeys = new Set<string>();
  const matched: HallPriceListPlan["matched"] = [];
  const missing: HallCatalogProduct[] = [];

  for (const product of products) {
    const key = product.sku ? skuKey(product.sku) : "";
    const row = key ? rowByKey.get(key) : undefined;
    if (row && !matchedKeys.has(key)) {
      matched.push({ product, row });
      matchedKeys.add(key);
    } else {
      missing.push(product);
    }
  }

  return { matched, toCreate: rows.filter((row) => !matchedKeys.has(skuKey(row.sku))), missing };
}

/** ¿Cambia algo de lo que la lista puede tocar (costo o MSRP)? */
export function priceChanged(product: HallCatalogProduct, row: HallPriceRow): boolean {
  const same = (a: number | null | undefined, b: number | null | undefined) =>
    (a ?? null) === null && (b ?? null) === null ? true : Math.abs((a ?? 0) - (b ?? 0)) < 0.005;
  return !same(product.costUsd, row.costUsd) || !same(product.msrpUsd, row.msrpUsd ?? null);
}

const LBS_TO_KG = 0.45359237;
const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;

/** Datos físicos de la lista en las unidades del sistema (cm y kg). */
export function physicalData(row: HallPriceRow) {
  return {
    heightCm: row.deviceHeightMm ? round(row.deviceHeightMm / 10, 2) : undefined,
    widthCm: row.deviceWidthMm ? round(row.deviceWidthMm / 10, 2) : undefined,
    depthCm: row.deviceLengthMm ? round(row.deviceLengthMm / 10, 2) : undefined,
    weight: row.deviceWeightLbs ? round(row.deviceWeightLbs * LBS_TO_KG, 3) : undefined,
  };
}
