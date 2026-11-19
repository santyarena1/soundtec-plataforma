/**
 * Períodos del inicio del panel, en hora de Buenos Aires (UTC−3 fijo, sin
 * horario de verano). Puro: lo usan los bloques y sus pruebas.
 */

const ART_OFFSET_MS = 3 * 3_600_000;
export const DAY_MS = 86_400_000;

export type Period = { from: Date; to: Date };

/** Componentes de fecha «de pared» en Buenos Aires. */
function artParts(now: Date): { y: number; m: number; d: number } {
  const shifted = new Date(now.getTime() - ART_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

/** Instante UTC de la medianoche de Buenos Aires de ese día. */
function artMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) + ART_OFFSET_MS);
}

/** Medianoche de hoy en Buenos Aires. */
export function startOfDayArt(now: Date): Date {
  const { y, m, d } = artParts(now);
  return artMidnight(y, m, d);
}

/** Medianoche del día 1 del mes actual en Buenos Aires. */
export function startOfMonthArt(now: Date): Date {
  const { y, m } = artParts(now);
  return artMidnight(y, m, 1);
}

/**
 * Mes en curso hasta ahora, y el mismo tramo del mes anterior (del 1 al mismo
 * día y hora). Si el mes anterior es más corto (31 de marzo → febrero), el
 * tramo termina el último día de ese mes: nunca se mete en el mes actual.
 */
export function monthToDateRanges(now: Date): { current: Period; previous: Period } {
  const { y, m } = artParts(now);
  const currentFrom = artMidnight(y, m, 1);
  const previousFrom = artMidnight(y, m - 1, 1);
  const elapsed = now.getTime() - currentFrom.getTime();
  const previousTo = new Date(Math.min(previousFrom.getTime() + elapsed, currentFrom.getTime()));
  return { current: { from: currentFrom, to: now }, previous: { from: previousFrom, to: previousTo } };
}

export type Trend = "up" | "down" | "flat";

export type Comparison = {
  current: number;
  previous: number;
  delta: number;
  /** Variación porcentual redondeada. null si el mes anterior fue 0 (no hay base). */
  pct: number | null;
  trend: Trend;
};

/** Mes actual contra el anterior. */
export function compareValues(current: number, previous: number): Comparison {
  const c = Number.isFinite(current) ? current : 0;
  const p = Number.isFinite(previous) ? previous : 0;
  const delta = c - p;
  const pct = p === 0 ? null : Math.round((delta / p) * 100);
  const trend: Trend = Math.abs(delta) < 1e-9 ? "flat" : delta > 0 ? "up" : "down";
  return { current: c, previous: p, delta, pct, trend };
}

/** «+12 % vs. 1–18 oct.», «igual que…», «nuevo (el mes pasado no hubo)». */
export function comparisonText(cmp: Comparison): string {
  if (cmp.trend === "flat") return "igual que el mes pasado";
  if (cmp.pct === null) return "el mes pasado no hubo";
  const sign = cmp.pct > 0 ? "+" : "−";
  return `${sign}${Math.abs(cmp.pct)} % vs. mes pasado`;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «1–18 oct.» para aclarar contra qué tramo se compara. */
export function periodLabel(period: Period): string {
  const from = new Date(period.from.getTime() - ART_OFFSET_MS);
  const to = new Date(period.to.getTime() - ART_OFFSET_MS - 1);
  return `${from.getUTCDate()}–${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]}.`;
}

/** Nombre del mes actual («noviembre»). */
export function monthName(now: Date): string {
  const names = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return names[artParts(now).m];
}
