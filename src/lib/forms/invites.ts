import { randomBytes } from "node:crypto";
import * as XLSX from "xlsx";
import { appUrl } from "@/lib/app-url";

export type InviteRow = { email: string; name?: string; company?: string };

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Código del enlace personal: 12 caracteres al azar (no se puede adivinar el de otro). */
export function newInviteCode(): string {
  return randomBytes(9).toString("base64url");
}

export function inviteUrl(formToken: string, code: string): string {
  return `${appUrl()}/f/${formToken}?i=${code}`;
}

const HEADER_EMAIL = /e-?mail|correo|mail/i;
const HEADER_FIRST = /^(nombre|name|first ?name|nombres)$/i;
const HEADER_LAST = /^(apellido|apellidos|last ?name|surname)$/i;
const HEADER_FULL = /nombre|name|contacto|persona/i;
const HEADER_COMPANY = /empresa|compa[nñ][ií]a|company|raz[oó]n social|organizaci|cliente|estudio/i;

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Lee un Excel o CSV de invitados. Busca las columnas por su encabezado (Email /
 * Correo / Mail, Nombre y Apellido o Nombre completo, Empresa…); si no hay
 * encabezados reconocibles, toma la columna donde más celdas son mails.
 */
export function parseInviteSheet(data: ArrayBuffer): { rows: InviteRow[]; skipped: number; columns: string[] } {
  const book = XLSX.read(data, { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]!];
  if (!sheet) return { rows: [], skipped: 0, columns: [] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  if (!matrix.length) return { rows: [], skipped: 0, columns: [] };

  // Fila de encabezados: la primera (de las 10 primeras) que tenga una columna de mail.
  const headerIndex = matrix.slice(0, 10).findIndex((row) => row.some((cell) => HEADER_EMAIL.test(clean(cell)) && !isEmail(clean(cell))));
  const header = headerIndex >= 0 ? matrix[headerIndex]!.map(clean) : [];
  const find = (re: RegExp, except: number[] = []) => header.findIndex((h, i) => !except.includes(i) && re.test(h));

  let emailCol = header.length ? find(HEADER_EMAIL) : -1;
  if (emailCol < 0) {
    const width = Math.max(...matrix.map((r) => r.length));
    let best = -1;
    let bestCount = 0;
    for (let c = 0; c < width; c++) {
      const count = matrix.filter((r) => isEmail(clean(r[c]))).length;
      if (count > bestCount) [best, bestCount] = [c, count];
    }
    emailCol = best;
  }
  if (emailCol < 0) return { rows: [], skipped: matrix.length, columns: header };

  const firstCol = find(HEADER_FIRST, [emailCol]);
  const lastCol = find(HEADER_LAST, [emailCol]);
  const fullCol = firstCol < 0 ? find(HEADER_FULL, [emailCol, lastCol, find(HEADER_COMPANY)]) : -1;
  const companyCol = find(HEADER_COMPANY, [emailCol, firstCol, lastCol, fullCol]);

  const seen = new Set<string>();
  const rows: InviteRow[] = [];
  let skipped = 0;
  for (const row of matrix.slice(headerIndex + 1)) {
    // Una celda puede traer más de un mail («a@x.com; b@y.com»): se toma el primero válido.
    const email = clean(row[emailCol])
      .split(/[;,\s]+/)
      .map((e) => e.toLowerCase())
      .find(isEmail);
    if (!email || seen.has(email)) {
      if (clean(row[emailCol]) || row.some((c) => clean(c))) skipped += 1;
      continue;
    }
    seen.add(email);
    const name = firstCol >= 0 ? [clean(row[firstCol]), lastCol >= 0 ? clean(row[lastCol]) : ""].filter(Boolean).join(" ") : fullCol >= 0 ? clean(row[fullCol]) : "";
    const company = companyCol >= 0 ? clean(row[companyCol]) : "";
    rows.push({ email, name: name || undefined, company: company || undefined });
  }
  return { rows, skipped, columns: header };
}

/** Lista pegada a mano: un mail por línea, opcionalmente «Nombre <mail>» o «mail, nombre, empresa». */
export function parseInviteText(text: string): InviteRow[] {
  const seen = new Set<string>();
  const rows: InviteRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const angle = line.match(/^\s*(.*?)\s*<([^>]+)>/);
    const parts = angle ? [angle[2]!, angle[1]!] : line.split(/[;,\t]/).map((p) => p.trim());
    const emailIndex = parts.findIndex((p) => isEmail(p));
    if (emailIndex < 0) continue;
    const email = parts[emailIndex]!.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const rest = parts.filter((_, i) => i !== emailIndex).map(clean).filter(Boolean);
    rows.push({ email, name: rest[0] || undefined, company: rest[1] || undefined });
  }
  return rows;
}

/** Encabezado del mail (red de puntos + logo del evento), URL absoluta. */
export function inviteHeaderUrl(logo: string | undefined | null, origin = appUrl()): string {
  return `${origin}/api/forms/mail-header${logo ? `?u=${encodeURIComponent(logo)}` : ""}`;
}
