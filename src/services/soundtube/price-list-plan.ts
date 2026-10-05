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
  /** Coincide por una equivalencia confirmada por el usuario (ej. "PS1090a" → producto "PS1090a-BK"). */
  aliasMatch: boolean;
}

/** Equivalencias confirmadas: clave del SKU del Excel (skuKey) → id del producto. */
export type SkuAliases = ReadonlyMap<string, string>;

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

export function buildPriceListPlan(
  rows: PriceListRow[],
  products: CatalogProduct[],
  aliases: SkuAliases = new Map()
): PriceListPlan {
  const rowByKey = new Map(rows.map((row) => [skuKey(row.sku), row]));
  const matchedRows = new Set<PriceListRow>();
  const matched: MatchedProduct[] = [];
  const unmatched: CatalogProduct[] = [];

  // 1) Coincidencia exacta.
  for (const product of products) {
    const row = product.sku ? rowByKey.get(skuKey(product.sku)) : undefined;
    if (row) {
      matched.push({ product, row, looseMatch: false, aliasMatch: false });
      matchedRows.add(row);
    } else {
      unmatched.push(product);
    }
  }

  // 2) Equivalencias confirmadas por el usuario.
  const rowByAliasTarget = new Map<string, PriceListRow>();
  for (const row of rows) {
    const target = aliases.get(skuKey(row.sku));
    if (target && !matchedRows.has(row)) rowByAliasTarget.set(target, row);
  }
  const pending: CatalogProduct[] = [];
  for (const product of unmatched) {
    const row = rowByAliasTarget.get(product.id);
    if (row && !matchedRows.has(row)) {
      matched.push({ product, row, looseMatch: false, aliasMatch: true });
      matchedRows.add(row);
    } else {
      pending.push(product);
    }
  }

  // 3) Coincidencia ignorando espacios y guiones, solo si es inequívoca del lado del Excel.
  const looseRows = new Map<string, PriceListRow[]>();
  for (const row of rows) {
    if (matchedRows.has(row)) continue;
    const key = looseSkuKey(row.sku);
    looseRows.set(key, [...(looseRows.get(key) ?? []), row]);
  }
  const missing: CatalogProduct[] = [];
  for (const product of pending) {
    const candidates = product.sku ? looseRows.get(looseSkuKey(product.sku)) : undefined;
    if (candidates?.length === 1) {
      matched.push({ product, row: candidates[0], looseMatch: true, aliasMatch: false });
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

const MIN_PREFIX = 4;

/**
 * Productos del sistema que podrían ser el mismo que un SKU del Excel: uno
 * empieza con el otro ignorando espacios y guiones (ej. "PS1090a" ↔
 * "PS1090a-BK", "CI20X MP" ↔ "CI20X MP KIT"). Más parecidos primero.
 */
export function suggestCandidates(row: PriceListRow, products: CatalogProduct[]): CatalogProduct[] {
  const key = looseSkuKey(row.sku);
  if (key.length < MIN_PREFIX) return [];
  return products
    .filter((p) => {
      if (!p.sku) return false;
      const other = looseSkuKey(p.sku);
      return other !== key && other.length >= MIN_PREFIX && (other.startsWith(key) || key.startsWith(other));
    })
    .sort((a, b) => Math.abs(looseSkuKey(a.sku!).length - key.length) - Math.abs(looseSkuKey(b.sku!).length - key.length));
}
