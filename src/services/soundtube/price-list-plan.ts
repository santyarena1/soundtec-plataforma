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
  /** El SKU coincide solo ignorando espacios y guiones (ej. "SQUAREROOT 6.5 GG" ↔ "SQUAREROOT 6.5-GG"). */
  looseMatch: boolean;
}

/** Clave tolerante: sin espacios ni guiones. Las barras se respetan ("GG" ≠ "GG/T"). */
export function looseSkuKey(sku: string): string {
  return skuKey(sku).replace(/[\s-]+/g, "");
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
  const matchedRows = new Set<PriceListRow>();
  const matched: MatchedProduct[] = [];
  const unmatched: CatalogProduct[] = [];

  // 1) Coincidencia exacta.
  for (const product of products) {
    const row = product.sku ? rowByKey.get(skuKey(product.sku)) : undefined;
    if (row) {
      matched.push({ product, row, looseMatch: false });
      matchedRows.add(row);
    } else {
      unmatched.push(product);
    }
  }

  // 2) Coincidencia ignorando espacios y guiones, solo si es inequívoca del lado del Excel.
  const looseRows = new Map<string, PriceListRow[]>();
  for (const row of rows) {
    if (matchedRows.has(row)) continue;
    const key = looseSkuKey(row.sku);
    looseRows.set(key, [...(looseRows.get(key) ?? []), row]);
  }
  const missing: CatalogProduct[] = [];
  for (const product of unmatched) {
    const candidates = product.sku ? looseRows.get(looseSkuKey(product.sku)) : undefined;
    if (candidates?.length === 1) {
      matched.push({ product, row: candidates[0], looseMatch: true });
      matchedRows.add(candidates[0]);
    } else {
      missing.push(product);
    }
  }

  return {
    matched,
    notInSystem: rows.filter((row) => !matchedRows.has(row)),
    missing,
  };
}
