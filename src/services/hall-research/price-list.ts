/**
 * Lista de precios de Hall Research (Atlona, Javelin, Hall Tech, Gain Audio,
 * Captivate) en Excel. Columnas que usamos:
 * - Name: SKU del producto.
 * - Distributor: nuestro costo (USD).
 * - MSRP: precio de lista; se guarda solo para consulta en el admin.
 * - El resto (marca, categoría, descripciones, medidas, foto…) solo se usa al
 *   crear un producto nuevo: las listas siguientes no pisan esos datos.
 */

import * as XLSX from "xlsx";

export interface HallPriceRow {
  excelRow: number;
  sku: string;
  brand: string;
  costUsd: number;
  msrpUsd?: number;
  replacementSku?: string;
  status?: string;
  category?: string;
  shortDescription?: string;
  longDescription?: string;
  certificates?: string;
  upc?: string;
  htsEu?: string;
  htsUs?: string;
  coo?: string;
  warranty?: string;
  deviceHeightMm?: number;
  deviceWidthMm?: number;
  deviceLengthMm?: number;
  deviceWeightLbs?: number;
  packageWeightLbs?: number;
  webLink?: string;
  imageUrl?: string;
}

export interface InvalidRow {
  excelRow: number;
  sku: string;
  reason: string;
}

export interface ParsedHallPriceList {
  rows: HallPriceRow[];
  invalid: InvalidRow[];
  /** SKUs repetidos: se usa la primera fila. */
  duplicates: string[];
}

/** Clave para cruzar SKUs: sin espacios y en mayúsculas. */
export function skuKey(sku: string): string {
  return sku.trim().toUpperCase();
}

/** "$1,060.00" → 1060. Vacío o inválido → undefined. */
export function parseMoney(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const cleaned = String(value ?? "").replace(/[$,\s]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parseNumber(value: unknown): number | undefined {
  const n = parseMoney(value);
  return n !== undefined && n > 0 ? n : undefined;
}

function text(value: unknown): string | undefined {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s ? s : undefined;
}

/** "01 - Extenders" → "Extenders". */
export function cleanCategory(value: string | undefined): string | undefined {
  const s = value?.replace(/^\s*\d+\s*-\s*/, "").trim();
  return s ? s : undefined;
}

/** Encabezados normalizados ("Device\nHeight (mm)" → "device height (mm)"). */
function headerKey(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

const COLUMNS = {
  sku: "name",
  replacement: "replacement item",
  brand: "brands",
  status: "item status",
  category: "item category",
  msrp: "msrp",
  cost: "distributor",
  shortDescription: "short description",
  longDescription: "long description",
  certificates: "certificates",
  upc: "upc code/ean",
  htsEu: "htc-eu",
  htsUs: "htc-us custom",
  coo: "coo",
  warranty: "warranty",
  deviceHeightMm: "device height (mm)",
  deviceWidthMm: "device width (mm)",
  deviceLengthMm: "device length (mm)",
  deviceWeightLbs: "weight (lbs)",
  packageWeightLbs: "package weight (lbs)",
  webLink: "web link",
  imageUrl: "image url",
} as const;

const REQUIRED: Array<keyof typeof COLUMNS> = ["sku", "brand", "cost"];

/** Lee las filas ya separadas en celdas (la primera fila con «Name» y «Distributor» es el encabezado). */
export function parseHallPriceListRows(table: unknown[][]): ParsedHallPriceList {
  const headerIndex = table.findIndex((row) => {
    const keys = row.map(headerKey);
    return keys.includes(COLUMNS.sku) && keys.includes(COLUMNS.cost);
  });
  if (headerIndex < 0) {
    throw new Error("No encontré el encabezado de la lista (columnas «Name» y «Distributor»).");
  }
  const header = table[headerIndex].map(headerKey);
  const col = Object.fromEntries(
    Object.entries(COLUMNS).map(([field, name]) => [field, header.indexOf(name)])
  ) as Record<keyof typeof COLUMNS, number>;
  const missing = REQUIRED.filter((field) => col[field] < 0).map((field) => `«${COLUMNS[field]}»`);
  if (missing.length) throw new Error(`Faltan columnas en la lista: ${missing.join(", ")}.`);

  const cell = (row: unknown[], field: keyof typeof COLUMNS) => (col[field] >= 0 ? row[col[field]] : undefined);
  const rows: HallPriceRow[] = [];
  const invalid: InvalidRow[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (let i = headerIndex + 1; i < table.length; i++) {
    const row = table[i];
    const excelRow = i + 1;
    const sku = text(cell(row, "sku"));
    if (!sku) continue; // fila vacía
    const brand = text(cell(row, "brand"));
    const costUsd = parseMoney(cell(row, "cost"));
    if (!brand) {
      invalid.push({ excelRow, sku, reason: "Sin marca" });
      continue;
    }
    if (costUsd === undefined || costUsd <= 0) {
      invalid.push({ excelRow, sku, reason: "Sin costo (Distributor)" });
      continue;
    }
    const key = skuKey(sku);
    if (seen.has(key)) {
      duplicates.push(sku);
      continue;
    }
    seen.add(key);

    rows.push({
      excelRow,
      sku,
      brand,
      costUsd,
      msrpUsd: parseNumber(cell(row, "msrp")),
      replacementSku: text(cell(row, "replacement")),
      status: text(cell(row, "status")),
      category: cleanCategory(text(cell(row, "category"))),
      shortDescription: text(cell(row, "shortDescription")),
      longDescription: text(cell(row, "longDescription")),
      certificates: text(cell(row, "certificates")),
      upc: text(cell(row, "upc")),
      htsEu: text(cell(row, "htsEu")),
      htsUs: text(cell(row, "htsUs")),
      coo: text(cell(row, "coo")),
      warranty: text(cell(row, "warranty")),
      deviceHeightMm: parseNumber(cell(row, "deviceHeightMm")),
      deviceWidthMm: parseNumber(cell(row, "deviceWidthMm")),
      deviceLengthMm: parseNumber(cell(row, "deviceLengthMm")),
      deviceWeightLbs: parseNumber(cell(row, "deviceWeightLbs")),
      packageWeightLbs: parseNumber(cell(row, "packageWeightLbs")),
      webLink: text(cell(row, "webLink")),
      imageUrl: text(cell(row, "imageUrl")),
    });
  }

  return { rows, invalid, duplicates };
}

/** Lee el Excel (primera hoja). */
export function parseHallPriceListFile(buffer: Buffer): ParsedHallPriceList {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("El Excel no tiene hojas.");
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  return parseHallPriceListRows(table);
}
