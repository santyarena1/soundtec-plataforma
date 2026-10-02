/**
 * Cruza la lista Excel de SoundTube con los productos del sistema:
 * qué se actualiza, qué SKUs del Excel no existen y qué productos
 * quedaron afuera de la lista.
 */

import { skuKey, type PriceListRow } from "./price-list";

export interface CatalogProduct {
  id: string;
  sku: string | null;
  name: string;
  brand: string;
  costUsd: number;
  isActive: boolean;
}

export interface MatchedProduct {
  product: CatalogProduct;
  row: PriceListRow;
}

export interface PriceListPlan {
  matched: MatchedProduct[];
  /** Filas del Excel sin producto en el sistema. */
  notInSystem: PriceListRow[];
  /** Productos de SoundTube que no están en el Excel. */
  missing: CatalogProduct[];
}

export function buildPriceListPlan(rows: PriceListRow[], products: CatalogProduct[]): PriceListPlan {
  const rowByKey = new Map(rows.map((row) => [skuKey(row.sku), row]));
  const matchedKeys = new Set<string>();
  const matched: MatchedProduct[] = [];
  const missing: CatalogProduct[] = [];

  for (const product of products) {
    const key = product.sku ? skuKey(product.sku) : "";
    const row = key ? rowByKey.get(key) : undefined;
    if (row) {
      matched.push({ product, row });
      matchedKeys.add(key);
    } else {
      missing.push(product);
    }
  }

  return {
    matched,
    notInSystem: rows.filter((row) => !matchedKeys.has(skuKey(row.sku))),
    missing,
  };
}
