import * as XLSX from "xlsx";
import { firstEmailIn, normalizeEmail } from "@/lib/mail/address";
import type { MailContact } from "@/lib/mailing/variables";

/**
 * Importar listas desde Excel o CSV: leer la planilla, adivinar qué columna
 * es cada cosa (el usuario la corrige en pantalla) y armar los contactos
 * deduplicados y validados.
 */

export type SheetMatrix = { headers: string[]; rows: string[][]; headerRow: number };

export type ColumnMapping = {
  email: number;
  /** Nombre (o nombre completo). -1 = no hay. */
  name: number;
  /** Apellido aparte (se suma al nombre). -1 = no hay. */
  lastName: number;
  company: number;
  /** Columnas extra que se guardan como variables ({{ciudad}}). */
  extras: number[];
};

export type ImportResult = {
  contacts: MailContact[];
  /** Filas con datos pero sin un mail válido. */
  invalid: number;
  /** Mails repetidos dentro del archivo. */
  duplicates: number;
  /** Ejemplos de filas descartadas (para mostrarle al usuario qué pasó). */
  invalidSamples: string[];
};

const MAX_ROWS = 50_000;

const clean = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim();

/** CSV en UTF-8 (con o sin BOM) o Latin-1 (el que exporta Excel en Windows). */
function decodeCsv(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "");
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(bytes);
}

/** Lee la primera hoja. La fila de encabezados es la primera (de las 10 primeras) que tiene texto que no es un mail. */
export function readSheetMatrix(data: ArrayBuffer | Uint8Array, fileName = ""): SheetMatrix {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const isText = /\.(csv|txt|tsv)$/i.test(fileName);
  const book = isText ? XLSX.read(decodeCsv(bytes), { type: "string", raw: true }) : XLSX.read(bytes, { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]!];
  if (!sheet) return { headers: [], rows: [], headerRow: -1 };
  const matrix = XLSX.utils
    .sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "", raw: false })
    .map((r) => r.map(clean))
    .filter((r) => r.some(Boolean))
    .slice(0, MAX_ROWS + 10);
  if (!matrix.length) return { headers: [], rows: [], headerRow: -1 };
  // Encabezados: la fila justo antes del primer mail (salta títulos que haya arriba).
  // Si la primera fila ya trae mails, no hay encabezados: se numeran las columnas.
  const firstEmailRow = matrix.slice(0, 11).findIndex((r) => r.some((c) => firstEmailIn(c)));
  const headerRow = firstEmailRow > 0 ? firstEmailRow - 1 : firstEmailRow < 0 ? 0 : -1;
  const useHeader = headerRow >= 0;
  const width = Math.max(...matrix.map((r) => r.length));
  const headers = useHeader
    ? Array.from({ length: width }, (_, i) => matrix[headerRow]![i] || `Columna ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Columna ${i + 1}`);
  const rows = (useHeader ? matrix.slice(headerRow + 1) : matrix).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  return { headers, rows: rows.slice(0, MAX_ROWS), headerRow: useHeader ? headerRow : -1 };
}

const HEADER_EMAIL = /e-?mail|correo|mail/i;
const HEADER_FIRST = /^(nombre|name|first ?name|nombres)$/i;
const HEADER_LAST = /^(apellido|apellidos|last ?name|surname)$/i;
const HEADER_FULL = /nombre|name|contacto|persona/i;
const HEADER_COMPANY = /empresa|compa[nñ][ií]a|company|raz[oó]n social|organizaci|cliente|estudio|firma/i;

/** Propuesta de columnas: por encabezado y, para el mail, por la columna con más mails. */
export function guessMapping(sheet: SheetMatrix): ColumnMapping {
  const { headers, rows } = sheet;
  const taken = new Set<number>();
  const find = (re: RegExp) => {
    const index = headers.findIndex((h, i) => !taken.has(i) && re.test(h));
    if (index >= 0) taken.add(index);
    return index;
  };
  // El mail: la columna donde más celdas son mails (aunque el encabezado diga otra cosa).
  let email = -1;
  let best = 0;
  for (let c = 0; c < headers.length; c++) {
    const count = rows.slice(0, 500).filter((r) => firstEmailIn(r[c])).length;
    if (count > best) [email, best] = [c, count];
  }
  if (email < 0) email = headers.findIndex((h) => HEADER_EMAIL.test(h));
  if (email >= 0) taken.add(email);
  const first = find(HEADER_FIRST);
  const lastName = find(HEADER_LAST);
  const company = find(HEADER_COMPANY);
  const name = first >= 0 ? first : find(HEADER_FULL);
  return { email, name, lastName, company, extras: [] };
}

/** Arma los contactos según las columnas elegidas: valida, deduplica y guarda las columnas extra. */
export function rowsFromMatrix(sheet: SheetMatrix, mapping: ColumnMapping): ImportResult {
  const seen = new Set<string>();
  const contacts: MailContact[] = [];
  let invalid = 0;
  let duplicates = 0;
  const invalidSamples: string[] = [];
  if (mapping.email < 0) return { contacts, invalid: sheet.rows.length, duplicates, invalidSamples };
  const extras = mapping.extras.filter((c) => c >= 0 && c < sheet.headers.length && c !== mapping.email);

  for (const row of sheet.rows) {
    const email = firstEmailIn(row[mapping.email]);
    if (!email) {
      invalid += 1;
      if (invalidSamples.length < 5) invalidSamples.push(row[mapping.email] || row.filter(Boolean).slice(0, 2).join(" · "));
      continue;
    }
    const key = normalizeEmail(email);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    const name = [mapping.name >= 0 ? row[mapping.name] : "", mapping.lastName >= 0 ? row[mapping.lastName] : ""].map(clean).filter(Boolean).join(" ");
    const fields: Record<string, string> = {};
    for (const c of extras) {
      const value = clean(row[c]);
      if (value) fields[sheet.headers[c]!] = value.slice(0, 300);
    }
    contacts.push({
      email: key,
      name: name.slice(0, 200) || null,
      company: mapping.company >= 0 ? clean(row[mapping.company]).slice(0, 200) || null : null,
      fields: Object.keys(fields).length ? fields : null,
    });
  }
  return { contacts, invalid, duplicates, invalidSamples };
}
