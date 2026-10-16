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
  /** Hojas leídas (separadas por " + " si la lista viene en varias). */
  sheetName: string;
  totalRows: number;
  /** Hojas salteadas porque sus columnas no son las de la lista. */
  skippedSheets: string[];
}

/** Mínimo de columnas en común con la hoja principal para sumar otra hoja. */
const MIN_SHARED_HEADERS = 0.6;

/**
 * Lee TODAS las hojas. La hoja con más filas define las columnas; las demás
 * se suman si comparten la mayoría de esas columnas (una lista partida en
 * varias hojas). Las que no (portada, condiciones) se informan como salteadas.
 */
export function parseExcelBuffer(buffer: ArrayBuffer | Buffer): ParsedExcel {
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (!wb.SheetNames.length) throw new Error("El archivo no contiene hojas.");
  const sheets = wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]!, { defval: null, raw: false });
    return { name, rows, headers: Object.keys(rows[0] || {}) };
  }).filter((s) => s.rows.length > 0);
  if (!sheets.length) return { headers: [], rows: [], sheetName: wb.SheetNames[0]!, totalRows: 0, skippedSheets: [] };

  const main = [...sheets].sort((a, b) => b.rows.length - a.rows.length)[0]!;
  const mainHeaders = new Set(main.headers);
  const used = sheets.filter((s) => {
    if (s === main) return true;
    const shared = s.headers.filter((h) => mainHeaders.has(h)).length;
    return shared / Math.max(1, mainHeaders.size) >= MIN_SHARED_HEADERS;
  });
  const rows = used.flatMap((s) => s.rows);
  const headers = [...new Set(used.flatMap((s) => s.headers))];
  return {
    headers,
    rows,
    sheetName: used.map((s) => s.name).join(" + "),
    totalRows: rows.length,
    skippedSheets: sheets.filter((s) => !used.includes(s)).map((s) => s.name),
  };
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
