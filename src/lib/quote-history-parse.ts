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

function cellText(v: unknown) {
  if (v == null) return "";
  return String(v).trim();
}

function looksLibre(name: string) {
  return /^libre/i.test(name.trim());
}

function parseSheetRows(ws: XLSX.WorkSheet): ParsedHistoricalLine[] {
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: "" });
  const parsed: ParsedHistoricalLine[] = [];
  for (const row of rows) {
    const cells = Array.isArray(row) ? row.map(cellText) : [];
    const qtyCell = cells.find(
      (c) => /^\d+([.,]\d+)?$/.test(c) && Number(c.replace(",", ".")) > 0 && Number(c.replace(",", ".")) < 10000
    );
    const desc = cells
      .filter((c) => c.length > 8 && !/^\d+([.,]\d+)?$/.test(c))
      .sort((a, b) => b.length - a.length)[0];
    if (!desc) continue;
    if (/cantidad|descripcion|detalle|unitario|total|sku/i.test(desc) && desc.length < 40) continue;
    parsed.push({
      description: desc.slice(0, 2000),
      quantity: qtyCell ? Number(qtyCell.replace(",", ".")) : null,
    });
  }
  return parsed;
}

export function parseHistoricalWorkbook(wb: XLSX.WorkBook, sourceFile: string): ParseHistoricalResult {
  const sheetNames = Array.isArray(wb.SheetNames) ? wb.SheetNames : [];
  if (sheetNames.length === 0) {
    return { ok: false, error: "El Excel no tiene hojas.", sheets: 0, lines: 0 };
  }

  const sheets: ParsedHistoricalSheet[] = [];
  for (const sheetName of sheetNames) {
    if (looksLibre(sheetName)) continue;
    const ws = wb.Sheets?.[sheetName];
    if (!ws) continue;
    const lines = parseSheetRows(ws);
    if (lines.length < 2) continue;
    sheets.push({ sheetName, lines: lines.slice(0, MAX_LINES_PER_SHEET) });
  }

  if (sheets.length === 0) {
    return {
      ok: false,
      error: "No se encontraron hojas con planillas reconocibles en el archivo.",
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
