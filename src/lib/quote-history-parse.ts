import * as XLSX from "xlsx";

export type ParsedHistoricalLine = {
  description: string;
  quantity: number | null;
};

export type ParsedHistoricalSheet = {
  sheetName: string;
  lines: ParsedHistoricalLine[];
};

export type IngestHistoricalResult = {
  ok: boolean;
  error?: string;
  sheets?: number;
  lines?: number;
};

export type ParseHistoricalResult =
  | { ok: true; sourceFile: string; sheets: ParsedHistoricalSheet[] }
  | { ok: false; error: string; sheets?: number; lines?: number };

const MAX_FILE_BYTES = 40 * 1024 * 1024;
const MAX_LINES_PER_SHEET = 200;
export const INGEST_SHEET_BATCH = 20;

function cellText(v: unknown) {
  if (v == null) return "";
  return String(v).trim();
}

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function looksLibre(name: string) {
  return /^libre/i.test(name.trim());
}

function parseQty(raw: string): number | null {
  if (!/^\d+([.,]\d+)?$/.test(raw)) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 10000) return null;
  return n;
}

function isHeaderish(desc: string) {
  return /cantidad|descripcion|detalle|unitario|total|sku/i.test(desc) && desc.length < 40;
}

function findHeader(rows: string[][]): { qtyIdx: number; descIdx: number; dataFrom: number } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const folded = rows[i].map(fold);
    const qtyIdx = folded.findIndex((c) => /^(cant|cantidad|qty|quantity)\b/.test(c));
    const descIdx = folded.findIndex((c) => /descrip|detalle/.test(c));
    if (qtyIdx >= 0 && descIdx >= 0 && qtyIdx !== descIdx) {
      return { qtyIdx, descIdx, dataFrom: i + 1 };
    }
  }
  return null;
}

function parseSheetRows(ws: XLSX.WorkSheet): ParsedHistoricalLine[] {
  const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: "" });
  const rows = raw.map((row) => (Array.isArray(row) ? row.map(cellText) : []));
  const parsed: ParsedHistoricalLine[] = [];
  const header = findHeader(rows);

  if (header) {
    for (const cells of rows.slice(header.dataFrom)) {
      const desc = (cells[header.descIdx] || "").slice(0, 2000);
      if (desc.length < 4 || isHeaderish(desc)) continue;
      parsed.push({ description: desc, quantity: parseQty(cells[header.qtyIdx] || "") });
    }
    return parsed;
  }

  for (const cells of rows) {
    const qty = cells.map(parseQty).find((n) => n != null) ?? null;
    const desc = cells
      .filter((c) => c.length > 8 && parseQty(c) == null)
      .sort((a, b) => b.length - a.length)[0];
    if (!desc || isHeaderish(desc)) continue;
    parsed.push({ description: desc.slice(0, 2000), quantity: qty });
  }
  return parsed;
}

export function parseHistoricalWorkbook(wb: XLSX.WorkBook, sourceFile: string): ParseHistoricalResult {
  const sheetNames = Array.isArray(wb.SheetNames) ? wb.SheetNames : [];
  if (sheetNames.length === 0) {
    return { ok: false, error: "El Excel no tiene hojas.", sheets: 0, lines: 0 };
  }

  const sheets: ParsedHistoricalSheet[] = [];
  let libreCount = 0;
  for (const sheetName of sheetNames) {
    if (looksLibre(sheetName)) {
      libreCount += 1;
      continue;
    }
    const ws = wb.Sheets?.[sheetName];
    if (!ws) continue;
    const lines = parseSheetRows(ws);
    if (lines.length < 1) continue;
    sheets.push({ sheetName, lines: lines.slice(0, MAX_LINES_PER_SHEET) });
  }

  if (sheets.length === 0) {
    return {
      ok: false,
      error: `No se encontraron hojas con planillas reconocibles (${sheetNames.length} hojas, ${libreCount} LIBRE).`,
      sheets: 0,
      lines: 0,
    };
  }

  return { ok: true, sourceFile, sheets };
}

export function parseHistoricalWorkbookFromBytes(bytes: ArrayBuffer, sourceFile: string): ParseHistoricalResult {
  if (bytes.byteLength === 0) {
    return { ok: false, error: "Subí el Excel de planillas.", sheets: 0, lines: 0 };
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, error: "El archivo supera los 40 MB. Dividí el Excel y subilo por partes.", sheets: 0, lines: 0 };
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(new Uint8Array(bytes), { type: "array" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "archivo ilegible";
    return {
      ok: false,
      error: `No se pudo leer el Excel (${detail}). Verificá que sea .xlsx o .xls válido.`,
      sheets: 0,
      lines: 0,
    };
  }

  return parseHistoricalWorkbook(wb, sourceFile || "Planillas de Cotizacion.xlsx");
}

export function chunkHistoricalSheets<T>(sheets: T[], size = INGEST_SHEET_BATCH): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < sheets.length; i += size) {
    batches.push(sheets.slice(i, i + size));
  }
  return batches;
}
