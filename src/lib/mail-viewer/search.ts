import type { MessageFilters, SearchField } from "./types";

/**
 * Parámetros de la bandeja (de la URL) validados y la búsqueda IMAP armada a
 * partir de ellos. Puro: lo usan el proveedor IMAP, el de prueba y los tests.
 *
 * Nada de lo que escribe el usuario se concatena en un comando IMAP: va como
 * valor de un objeto que imapflow manda como string citado/literal, y antes se
 * le sacan los caracteres de control (CR/LF incluidos) y se acota el largo.
 */

export const MAX_QUERY_LENGTH = 120;
export const MAX_UID = 4_294_967_295;
const FIELDS: SearchField[] = ["all", "from", "to", "subject", "text"];

/** Saca caracteres de control, comillas dobles y barras invertidas; colapsa espacios. */
export function cleanSearchText(value: unknown): string {
  if (typeof value !== "string") return "";
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f"\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_QUERY_LENGTH)
  );
}

/** YYYY-MM-DD válido o null. */
export function parseDateParam(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return value;
}

/** UID IMAP: entero positivo de 32 bits, o null. */
export function parseUid(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^\d{1,10}$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= MAX_UID ? n : null;
}

/** Sección MIME («1», «2.1», «1.2.3»…), o null. */
export function parsePart(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[1-9]\d{0,3}(\.[1-9]\d{0,3}){0,9}$/.test(value) ? value : null;
}

/** Página de la URL (1 en adelante, con tope). */
export function parsePage(value: unknown, max = 10_000): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : 1;
}

export function parseFilters(params: Record<string, string | undefined>): MessageFilters {
  const field = FIELDS.includes(params.campo as SearchField) ? (params.campo as SearchField) : "all";
  let from = parseDateParam(params.desde);
  let to = parseDateParam(params.hasta);
  if (from && to && from > to) [from, to] = [to, from];
  return { q: cleanSearchText(params.q), field, from, to, unread: params.noLeidos === "1" };
}

export function hasFilters(f: MessageFilters): boolean {
  return Boolean(f.q || f.from || f.to || f.unread);
}

/** Forma de SearchObject de imapflow (sin depender del paquete). */
export type ImapSearch = {
  all?: boolean;
  seen?: boolean;
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  since?: Date;
  before?: Date;
  or?: ImapSearch[];
};

function nextDay(ymd: string): Date {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

/**
 * Búsqueda IMAP: «todo» busca en De, Para y Asunto (rápido); «texto» busca
 * también en el cuerpo (el servidor puede tardar más). SINCE/BEFORE comparan
 * por día (sin hora), así que «hasta» se pasa como BEFORE del día siguiente.
 */
export function buildImapSearch(f: MessageFilters): ImapSearch {
  const search: ImapSearch = {};
  const q = cleanSearchText(f.q);
  if (q) {
    if (f.field === "all") search.or = [{ from: q }, { to: q }, { subject: q }];
    else search[f.field] = q;
  }
  if (f.from) search.since = new Date(`${f.from}T00:00:00Z`);
  if (f.to) search.before = nextDay(f.to);
  if (f.unread) search.seen = false;
  return Object.keys(search).length ? search : { all: true };
}

/** Clave estable para la caché de listados. */
export function filtersKey(f: MessageFilters): string {
  return JSON.stringify([f.q.toLowerCase(), f.field, f.from, f.to, f.unread]);
}

/**
 * Página de UIDs: los más nuevos primero. IMAP devuelve los UID en orden
 * ascendente (más o menos el orden de llegada).
 */
export function pageOfUids(uids: number[], page: number, pageSize: number): { slice: number[]; total: number; page: number } {
  const sorted = [...uids].sort((a, b) => b - a);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return { slice: sorted.slice((current - 1) * pageSize, current * pageSize), total: sorted.length, page: current };
}
