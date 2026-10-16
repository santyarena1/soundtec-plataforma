/**
 * Lista de precios de SoundTube en Excel (la que arma Soundtec, ej. "Lista 2609").
 *
 * Columnas que se usan: "Item Number/SKU", "Item Description", "SPRDIS US"
 * (costo), "MUP" (markup del producto) y la clasificación CATEGORIA /
 * SEGMENTO / FAMILIA / TIPO. Se ignoran MSRP/MAP, SPRDIS CH, SPRDIS EU y
 * PRECIO (= costo × MUP, se recalcula en el sistema).
 *
 * Se leen TODAS las hojas del libro: cada hoja que tenga los encabezados de
 * la lista suma sus filas (una lista puede venir partida en varias hojas).
 */

import * as XLSX from "xlsx";

export interface PriceListRow {
  /** Fila de Excel (1-based) para que el usuario la encuentre. */
  excelRow: number;
  /** Hoja del Excel (solo si el libro tiene más de una hoja con precios). */
  sheet?: string;
  /** Posición de la hoja en el libro (0 = primera). */
  sheetIndex?: number;
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
  sheet?: string;
  sheetIndex?: number;
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
  invalid: Array<{ excelRow: number; sheet?: string; sku: string; reason: string }>;
  /** Hojas del libro: cuántas filas aportó cada una o por qué se salteó. */
  sheets?: Array<{ name: string; rows: number; skipped?: string }>;
}

const MAX_MUP = 20;
const HEADER_SCAN_ROWS = 15;
/** Separación entre hojas en `rowRef` (ninguna lista tiene 100.000 filas). */
const SHEET_STRIDE = 100_000;

/** Encabezados aceptados por columna (el primero es el de la lista de Soundtec). */
const COLUMNS = {
  sku: ["item number/sku", "item number", "sku", "item", "modelo", "código", "codigo"],
  description: ["item description", "description", "descripción", "descripcion"],
  cost: ["sprdis us", "sprdis", "costo", "costo usd", "cost"],
  mup: ["mup", "markup"],
  categoria: ["categoria", "categoría"],
  segmento: ["segmento"],
  familia: ["familia"],
  tipo: ["tipo"],
} as const;

type ColumnKey = keyof typeof COLUMNS;

/** Clave para comparar SKUs: mayúsculas y espacios colapsados. */
export function skuKey(sku: string): string {
  return sku.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Identificador único de una fila en todo el libro (hoja + fila). */
export function rowRef(row: { excelRow: number; sheetIndex?: number }): number {
  return (row.sheetIndex ?? 0) * SHEET_STRIDE + row.excelRow;
}

/** "Fila 12", o "Hoja Rockustics · fila 12" cuando la lista viene en varias hojas. */
export function rowLabel(row: { excelRow: number; sheet?: string }): string {
  return row.sheet ? `Hoja ${row.sheet} · fila ${row.excelRow}` : `Fila ${row.excelRow}`;
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
      const accepted: readonly string[] = COLUMNS[key];
      columns[key] = cells.findIndex((c) => accepted.includes(c));
    }
    if (columns.sku >= 0 && columns.cost >= 0 && columns.mup >= 0) return { index: r, columns };
  }
  throw new Error(
    'No encontré los encabezados. El Excel tiene que tener las columnas "Item Number/SKU", "SPRDIS US" y "MUP".'
  );
}

type SheetInfo = { name?: string; index?: number };

/** Filas válidas e inválidas de una hoja, sin deduplicar. */
function extractRows(grid: unknown[][], sheet: SheetInfo): { rows: PriceListRow[]; invalid: ParsedPriceList["invalid"] } {
  const { index, columns } = findHeader(grid);
  const pick = (row: unknown[], key: ColumnKey) => (columns[key] >= 0 ? row[columns[key]] : undefined);
  const where = sheet.name !== undefined ? { sheet: sheet.name, sheetIndex: sheet.index } : {};

  const invalid: ParsedPriceList["invalid"] = [];
  const rows: PriceListRow[] = [];
  for (let r = index + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const sku = cellText(pick(row, "sku"));
    if (!sku) continue;
    const excelRow = r + 1;
    const costUsd = cellNumber(pick(row, "cost"));
    const mup = cellNumber(pick(row, "mup"));
    if (costUsd === undefined || costUsd <= 0) {
      invalid.push({ excelRow, ...(where.sheet !== undefined ? { sheet: where.sheet } : {}), sku, reason: "Sin costo (SPRDIS US)" });
      continue;
    }
    if (mup === undefined || mup <= 0 || mup > MAX_MUP) {
      invalid.push({ excelRow, ...(where.sheet !== undefined ? { sheet: where.sheet } : {}), sku, reason: `MUP inválido (${String(pick(row, "mup") ?? "vacío")})` });
      continue;
    }
    rows.push({
      excelRow,
      ...where,
      sku: sku.replace(/\s+/g, " "),
      description: cellText(pick(row, "description")) ?? "",
      costUsd,
      mup,
      categoria: cellText(pick(row, "categoria")),
      segmento: cellText(pick(row, "segmento")),
      familia: cellText(pick(row, "familia")),
      tipo: cellText(pick(row, "tipo")),
    });
  }
  return { rows, invalid };
}

/** Une las filas de una o varias hojas. Duplicados: gana la última fila (de la última hoja). */
function dedupeRows(all: PriceListRow[], invalid: ParsedPriceList["invalid"]): ParsedPriceList {
  const bySku = new Map<string, PriceListRow[]>();
  for (const row of all) {
    const key = skuKey(row.sku);
    bySku.set(key, [...(bySku.get(key) ?? []), row]);
  }

  const rows: PriceListRow[] = [];
  const warnings: PriceListWarning[] = [];
  const classificationConflicts: ClassificationConflict[] = [];
  const classification = (g: PriceListRow): ClassificationOption => ({
    excelRow: g.excelRow,
    ...(g.sheet !== undefined ? { sheet: g.sheet, sheetIndex: g.sheetIndex } : {}),
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
            .map((g) => `${rowLabel(g).toLowerCase()}: ${g.costUsd} × ${g.mup}`)
            .join(" · ")}). Se usa ${rowLabel(last).toLowerCase()}.`,
        });
      }
      // Una opción por clasificación distinta (la última fila que la usa).
      const distinct = new Map(group.map((g) => [classKey(g), classification(g)]));
      if (distinct.size > 1) classificationConflicts.push({ sku: last.sku, options: [...distinct.values()] });
    }
  }
  rows.sort((a, b) => rowRef(a) - rowRef(b));
  return { rows, warnings, invalid, classificationConflicts };
}

/** Parsea la grilla de una hoja. Duplicados: gana la última fila. */
export function parsePriceListGrid(grid: unknown[][]): ParsedPriceList {
  const { rows, invalid } = extractRows(grid, {});
  return dedupeRows(rows, invalid);
}

/**
 * Parsea todas las hojas. Las que no tienen los encabezados de la lista
 * (portada, notas, condiciones) se informan como salteadas. Si una sola hoja
 * trae precios, las filas se muestran como siempre ("Fila 12").
 */
export function parsePriceListSheets(sheets: Array<{ name: string; grid: unknown[][] }>): ParsedPriceList {
  const read: Array<{ rows: PriceListRow[]; invalid: ParsedPriceList["invalid"] }> = [];
  const info: NonNullable<ParsedPriceList["sheets"]> = [];
  sheets.forEach(({ name, grid }, index) => {
    try {
      const extracted = extractRows(grid, { name, index });
      read.push(extracted);
      info.push({ name, rows: extracted.rows.length });
    } catch {
      info.push({ name, rows: 0, skipped: "No tiene las columnas de la lista (SKU, SPRDIS US y MUP)" });
    }
  });
  if (!read.length) {
    throw new Error(
      'No encontré los encabezados en ninguna hoja. El Excel tiene que tener las columnas "Item Number/SKU", "SPRDIS US" y "MUP".'
    );
  }
  const single = read.length === 1;
  const plain = <T extends { sheet?: string; sheetIndex?: number }>(r: T): T => {
    if (!single) return r;
    const { sheet: _sheet, sheetIndex: _index, ...rest } = r;
    return rest as T;
  };
  const rows = read.flatMap((s) => s.rows.map(plain));
  const invalid = read.flatMap((s) => s.invalid.map(plain));
  return { ...dedupeRows(rows, invalid), sheets: info };
}

export function parsePriceListFile(buffer: ArrayBuffer | Buffer): ParsedPriceList {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  if (!workbook.SheetNames.length) throw new Error("El Excel no tiene hojas.");
  return parsePriceListSheets(
    workbook.SheetNames.map((name) => ({
      name,
      grid: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name]!, { header: 1, defval: "", raw: true }),
    }))
  );
}
