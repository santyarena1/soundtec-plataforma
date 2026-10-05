/**
 * Lista de precios de SoundTube en Excel (la que arma Soundtec, ej. "Lista 2609").
 *
 * Columnas que se usan: "Item Number/SKU", "Item Description", "SPRDIS US"
 * (costo), "MUP" (markup del producto) y la clasificación CATEGORIA /
 * SEGMENTO / FAMILIA / TIPO. Se ignoran MSRP/MAP, SPRDIS CH, SPRDIS EU y
 * PRECIO (= costo × MUP, se recalcula en el sistema).
 */

import * as XLSX from "xlsx";

export interface PriceListRow {
  /** Fila de Excel (1-based) para que el usuario la encuentre. */
  excelRow: number;
  sku: string;
  description: string;
  costUsd: number;
  mup: number;
  categoria?: string;
  segmento?: string;
  familia?: string;
  tipo?: string;
}

export interface PriceListWarning {
  sku: string;
  excelRows: number[];
  message: string;
}

export interface ClassificationOption {
  excelRow: number;
  categoria?: string;
  segmento?: string;
  familia?: string;
  tipo?: string;
}

/** SKU repetido cuya clasificación cambia entre filas: hay que elegir cuál vale. */
export interface ClassificationConflict {
  sku: string;
  options: ClassificationOption[];
}

export interface ParsedPriceList {
  rows: PriceListRow[];
  warnings: PriceListWarning[];
  classificationConflicts: ClassificationConflict[];
  /** Filas descartadas (sin costo o MUP válido). */
  invalid: Array<{ excelRow: number; sku: string; reason: string }>;
}

const MAX_MUP = 20;
const HEADER_SCAN_ROWS = 15;

const COLUMNS = {
  sku: "item number/sku",
  description: "item description",
  cost: "sprdis us",
  mup: "mup",
  categoria: "categoria",
  segmento: "segmento",
  familia: "familia",
  tipo: "tipo",
} as const;

type ColumnKey = keyof typeof COLUMNS;

/** Clave para comparar SKUs: mayúsculas y espacios colapsados. */
export function skuKey(sku: string): string {
  return sku.trim().replace(/\s+/g, " ").toUpperCase();
}

function headerText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cellText(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function cellNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = String(value ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!text) return undefined;
  // "1.234,56" → 1234.56 ; "1234.56" → 1234.56
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function findHeader(grid: unknown[][]): { index: number; columns: Record<ColumnKey, number> } {
  for (let r = 0; r < Math.min(grid.length, HEADER_SCAN_ROWS); r++) {
    const cells = (grid[r] ?? []).map(headerText);
    const columns = {} as Record<ColumnKey, number>;
    for (const key of Object.keys(COLUMNS) as ColumnKey[]) {
      columns[key] = cells.indexOf(COLUMNS[key]);
    }
    if (columns.sku >= 0 && columns.cost >= 0 && columns.mup >= 0) return { index: r, columns };
  }
  throw new Error(
    'No encontré los encabezados. El Excel tiene que tener las columnas "Item Number/SKU", "SPRDIS US" y "MUP".'
  );
}

/** Parsea la grilla de la primera hoja. Duplicados: gana la última fila. */
export function parsePriceListGrid(grid: unknown[][]): ParsedPriceList {
  const { index, columns } = findHeader(grid);
  const pick = (row: unknown[], key: ColumnKey) => (columns[key] >= 0 ? row[columns[key]] : undefined);

  const invalid: ParsedPriceList["invalid"] = [];
  const bySku = new Map<string, PriceListRow[]>();

  for (let r = index + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const sku = cellText(pick(row, "sku"));
    if (!sku) continue;
    const excelRow = r + 1;
    const costUsd = cellNumber(pick(row, "cost"));
    const mup = cellNumber(pick(row, "mup"));
    if (costUsd === undefined || costUsd <= 0) {
      invalid.push({ excelRow, sku, reason: "Sin costo (SPRDIS US)" });
      continue;
    }
    if (mup === undefined || mup <= 0 || mup > MAX_MUP) {
      invalid.push({ excelRow, sku, reason: `MUP inválido (${String(pick(row, "mup") ?? "vacío")})` });
      continue;
    }
    const parsed: PriceListRow = {
      excelRow,
      sku: sku.replace(/\s+/g, " "),
      description: cellText(pick(row, "description")) ?? "",
      costUsd,
      mup,
      categoria: cellText(pick(row, "categoria")),
      segmento: cellText(pick(row, "segmento")),
      familia: cellText(pick(row, "familia")),
      tipo: cellText(pick(row, "tipo")),
    };
    const key = skuKey(sku);
    bySku.set(key, [...(bySku.get(key) ?? []), parsed]);
  }

  const rows: PriceListRow[] = [];
  const warnings: PriceListWarning[] = [];
  const classificationConflicts: ClassificationConflict[] = [];
  const classification = (g: PriceListRow): ClassificationOption => ({
    excelRow: g.excelRow,
    categoria: g.categoria,
    segmento: g.segmento,
    familia: g.familia,
    tipo: g.tipo,
  });
  const classKey = (g: PriceListRow) => [g.categoria, g.segmento, g.familia, g.tipo].map((v) => v ?? "").join("|");
  for (const group of bySku.values()) {
    const last = group[group.length - 1];
    rows.push(last);
    if (group.length > 1) {
      const priceConflict = new Set(group.map((g) => `${g.costUsd}|${g.mup}`)).size > 1;
      if (priceConflict) {
        warnings.push({
          sku: last.sku,
          excelRows: group.map((g) => g.excelRow),
          message: `Repetido con distinto costo/MUP (${group
            .map((g) => `fila ${g.excelRow}: ${g.costUsd} × ${g.mup}`)
            .join(" · ")}). Se usa la fila ${last.excelRow}.`,
        });
      }
      // Una opción por clasificación distinta (la última fila que la usa).
      const distinct = new Map(group.map((g) => [classKey(g), classification(g)]));
      if (distinct.size > 1) classificationConflicts.push({ sku: last.sku, options: [...distinct.values()] });
    }
  }
  rows.sort((a, b) => a.excelRow - b.excelRow);
  return { rows, warnings, invalid, classificationConflicts };
}

export function parsePriceListFile(buffer: ArrayBuffer | Buffer): ParsedPriceList {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("El Excel no tiene hojas.");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  return parsePriceListGrid(grid);
}
