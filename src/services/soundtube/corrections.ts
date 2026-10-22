/**
 * Planilla «Para revisar»: las dudas de la lista SoundTube con la respuesta
 * del usuario en la primera columna (amarilla). Hojas con el encabezado
 * «Fila en tu Excel» + las columnas de la lista. Se aplican sobre la hoja de
 * productos de la lista antes de leerla:
 *
 * - valores editados en la fila (ej. MUP 3,05 → 2,75) reemplazan a los de la lista;
 * - «ELIMINAR» saca la fila;
 * - «OK» en una fila de un SKU repetido: esa vale y se sacan las otras del mismo SKU;
 * - en la hoja de marcas, el texto es la marca (columna MARCA);
 * - en la hoja de SKUs, un texto distinto de «CORRECTO» es el SKU correcto.
 *
 * Cada corrección se aplica solo si la fila de la lista tiene el mismo SKU que
 * la planilla (si no, se informa y no se toca nada de esa fila).
 */

import * as XLSX from "xlsx";

export interface Correction {
  sheet: string;
  /** Fila (1-based) en la hoja de productos de la lista. */
  row: number;
  answer: string;
  /** Encabezado (en minúsculas) → valor, tal como quedó en la planilla. */
  values: Record<string, unknown>;
}

export interface CorrectionsReport {
  applied: number;
  deleted: Array<{ row: number; sku: string }>;
  brands: number;
  renamed: Array<{ from: string; to: string }>;
  skipped: Array<{ row: number; reason: string }>;
}

const norm = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const sameNumber = (a: unknown, b: unknown) => {
  const x = Number(a);
  const y = Number(b);
  return String(a ?? "").trim() !== "" && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-6;
};
const skuOf = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/** ¿Es una planilla de correcciones? (alguna hoja con «Fila en tu Excel»). */
export function isCorrectionsWorkbook(buffer: ArrayBuffer | Buffer): boolean {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames.some((n) => findHeaderRow(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n]!, { header: 1, defval: "" })) >= 0);
}

function findHeaderRow(grid: unknown[][]): number {
  return grid.slice(0, 10).findIndex((r) => (r ?? []).some((c) => norm(c) === "fila en tu excel"));
}

export function parseCorrections(buffer: ArrayBuffer | Buffer): Correction[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const out: Correction[] = [];
  for (const sheet of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet]!, { header: 1, defval: "", raw: true });
    const h = findHeaderRow(grid);
    if (h < 0) continue;
    const header = (grid[h] ?? []).map(norm);
    const rowCol = header.indexOf("fila en tu excel");
    for (const r of grid.slice(h + 1)) {
      const row = Number((r ?? [])[rowCol]);
      if (!Number.isInteger(row) || row < 1) continue;
      const values: Record<string, unknown> = {};
      header.forEach((name, i) => {
        if (i > rowCol && name) values[name] = (r ?? [])[i];
      });
      out.push({ sheet, row, answer: String((r ?? [])[0] ?? "").trim(), values });
    }
  }
  return out;
}

/** Aplica las correcciones a la grilla de la hoja de productos (devuelve una grilla nueva). */
export function applyCorrections(grid: unknown[][], corrections: Correction[]): { grid: unknown[][]; report: CorrectionsReport } {
  const report: CorrectionsReport = { applied: 0, deleted: [], brands: 0, renamed: [], skipped: [] };
  const rows = grid.map((r) => [...(r ?? [])]);
  // Solo cuenta lo que el usuario cambió respecto de la lista original: la planilla repite
  // filas entre hojas y una copia sin tocar no puede pisar la corrección de otra hoja.
  const pristine = grid.map((r) => [...(r ?? [])]);
  const headerIndex = rows.findIndex((r) => r.some((c) => norm(c) === "item number/sku"));
  if (headerIndex < 0) return { grid: rows, report };
  const header = rows[headerIndex]!.map(norm);
  const skuCol = header.indexOf("item number/sku");
  let brandCol = header.findIndex((c) => c === "marca" || c === "brand");
  const remove = new Set<number>();

  for (const c of corrections) {
    const i = c.row - 1;
    const target = rows[i];
    const before = pristine[i] ?? [];
    const listedSku = skuOf(c.values["item number/sku"]);
    if (!target || i <= headerIndex) {
      report.skipped.push({ row: c.row, reason: "La fila no existe en la lista" });
      continue;
    }
    const answer = c.answer.toUpperCase();
    const original = skuOf(target[skuCol]);
    // La fila tiene que ser la misma (mismo SKU, o el SKU corregido en la hoja de SKUs).
    const sameRow = original === listedSku || original.replace(/[\s-]/g, "") === listedSku.replace(/[\s-]/g, "");
    if (!sameRow) {
      report.skipped.push({ row: c.row, reason: `En la lista la fila ${c.row} es ${original || "vacía"}, no ${listedSku}` });
      continue;
    }
    if (answer === "ELIMINAR") {
      remove.add(i);
      report.deleted.push({ row: c.row, sku: String(target[skuCol]).trim() });
      continue;
    }
    // Valores editados en la planilla (MUP, costo, clasificación…).
    let changed = false;
    for (const [name, value] of Object.entries(c.values)) {
      const col = header.indexOf(name);
      if (col < 0 || col === skuCol || name === "precio") continue;
      if (String(value ?? "").trim() === "") continue;
      if (norm(before[col]) !== norm(value) && !sameNumber(before[col], value)) {
        target[col] = value;
        changed = true;
      }
    }
    // SKU corregido (en la planilla o como respuesta en la hoja de SKUs).
    const fixedSku = !["", "OK", "CORRECTO"].includes(answer) && /sku/i.test(c.sheet) ? c.answer.trim() : String(c.values["item number/sku"] ?? "").trim();
    if (fixedSku && skuOf(fixedSku) !== original) {
      report.renamed.push({ from: String(target[skuCol]).trim(), to: fixedSku });
      target[skuCol] = fixedSku;
      changed = true;
    }
    // Marca (hoja de marcas): la respuesta es la marca.
    if (/marca|precios grises/i.test(c.sheet) && c.answer && !["OK", "CORRECTO"].includes(answer)) {
      if (brandCol < 0) {
        brandCol = header.length;
        header.push("marca");
        rows[headerIndex]![brandCol] = "MARCA";
      }
      target[brandCol] = c.answer;
      report.brands++;
      changed = true;
    }
    // «OK» en un repetido: vale esta fila, se sacan las demás del mismo SKU.
    if (answer === "OK") {
      rows.forEach((r, j) => {
        if (j > headerIndex && j !== i && skuOf(r[skuCol]) === original) remove.add(j);
      });
    }
    if (changed) report.applied++;
  }
  // Las filas eliminadas quedan vacías: así la numeración sigue siendo la del Excel original.
  return { grid: rows.map((r, j) => (remove.has(j) ? [] : r)), report };
}
