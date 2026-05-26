/**
 * Parser de Excel para listas de precios.
 *
 * Decisión: usamos sheetjs (`xlsx`) que soporta .xlsx, .xls y .csv,
 * funciona en Node serverless y no requiere dependencias nativas.
 *
 * Devolvemos siempre el header detectado y filas como Record<string, unknown>
 * para que el resto del pipeline trabaje con claves "humanas". El mapeo
 * a campos canónicos se hace después (manual o con OpenAI).
 */

import * as XLSX from "xlsx";

export interface ParsedExcel {
  headers: string[];
  rows: Record<string, unknown>[];
  sheetName: string;
  totalRows: number;
}

export function parseExcelBuffer(buffer: ArrayBuffer | Buffer): ParsedExcel {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("El archivo no contiene hojas.");
  const ws = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: false });
  const headers = Object.keys(rows[0] || {});
  return { headers, rows, sheetName, totalRows: rows.length };
}

export interface CanonicalProductDraft {
  sku: string | null;
  supplierSku: string | null;
  name: string | null;
  brand: string | null;
  category: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  baseCostUsd: number | null;
  currency: string | null;
  stockStatus: string | null;
  stockQuantity: number | null;
  discountPercent: number | null;
  imageUrl: string | null;
  accessories: string | null;
}

export type ColumnMapping = Record<string, keyof CanonicalProductDraft | null>;

export function applyMapping(row: Record<string, unknown>, mapping: ColumnMapping): CanonicalProductDraft {
  const draft: CanonicalProductDraft = {
    sku: null,
    supplierSku: null,
    name: null,
    brand: null,
    category: null,
    shortDescription: null,
    longDescription: null,
    baseCostUsd: null,
    currency: null,
    stockStatus: null,
    stockQuantity: null,
    discountPercent: null,
    imageUrl: null,
    accessories: null,
  };

  const writable = draft as unknown as Record<string, unknown>;
  for (const [sourceColumn, targetField] of Object.entries(mapping)) {
    if (!targetField) continue;
    const value = row[sourceColumn];
    if (value === null || value === undefined || value === "") continue;
    if (targetField === "baseCostUsd" || targetField === "discountPercent" || targetField === "stockQuantity") {
      writable[targetField] = parseNumber(value);
    } else {
      writable[targetField] = String(value).trim();
    }
  }
  return draft;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d,.\-]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
