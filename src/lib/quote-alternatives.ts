/**
 * Alternativas de una cotización: propuestas distintas para el mismo cliente
 * («Opción económica», «Opción premium»). Cada una tiene su propia planilla:
 * sus ambientes, sus productos y su total. El cliente elige una.
 *
 * Las cotizaciones viejas tienen ítems y ambientes sin alternativa: cuentan
 * como de la alternativa por defecto.
 */

export interface AlternativeRecord {
  id: string;
  name: string;
  purpose?: string | null;
  isDefault: boolean;
  sortOrder: number;
}

export function sortAlternatives<T extends AlternativeRecord>(alternatives: T[]): T[] {
  return [...alternatives].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** La alternativa por defecto (la marcada, o la primera). */
export function defaultAlternativeId(alternatives: AlternativeRecord[]): string | null {
  return alternatives.find((a) => a.isDefault)?.id ?? sortAlternatives(alternatives)[0]?.id ?? null;
}

/** A qué alternativa pertenece un ítem o ambiente (los sin alternativa van a la por defecto). */
export function alternativeOf(row: { alternativeId?: string | null }, alternatives: AlternativeRecord[]): string | null {
  if (row.alternativeId && alternatives.some((a) => a.id === row.alternativeId)) return row.alternativeId;
  return defaultAlternativeId(alternatives);
}

/** Filas de una alternativa. */
export function rowsOfAlternative<T extends { alternativeId?: string | null }>(
  rows: T[],
  alternativeId: string | null,
  alternatives: AlternativeRecord[]
): T[] {
  return rows.filter((row) => alternativeOf(row, alternatives) === alternativeId);
}

/**
 * Dónde va un ítem nuevo: si viene a un ambiente, a la alternativa de ese
 * ambiente; si no, a la pedida (si es de esta cotización) o a la por defecto.
 */
export function targetAlternativeId(input: {
  alternatives: AlternativeRecord[];
  requested?: string | null;
  group?: { alternativeId?: string | null } | null;
}): string | null {
  if (input.group) return alternativeOf(input.group, input.alternatives);
  if (input.requested && input.alternatives.some((a) => a.id === input.requested)) return input.requested;
  return defaultAlternativeId(input.alternatives);
}

/**
 * Ítems que representan «el total» de la cotización en listados, Excel y
 * resumen: con una sola alternativa, todos; con varias, la por defecto
 * (sumar opciones excluyentes daría un número que nadie va a pagar).
 */
export function primaryAlternativeItems<T extends { alternativeId?: string | null }>(
  items: T[],
  alternatives: AlternativeRecord[]
): T[] {
  if (alternatives.length <= 1) return items;
  return rowsOfAlternative(items, defaultAlternativeId(alternatives), alternatives);
}
