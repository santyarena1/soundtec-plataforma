/**
 * Comparación de precios «antes → después» para la revisión de cambios de
 * precio. Puro (sin base): recibe los precios ya calculados con la cadena real
 * (`priceProductsWithRules`) para cada cliente/lista y arma las filas y totales.
 */

export interface ReviewProductMeta {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
}

export interface ReviewAudiencePrices {
  /** null = lista general (todos los clientes sin condiciones propias). */
  clientId: string | null;
  name: string;
  before: Map<string, number>;
  after: Map<string, number>;
}

export interface ReviewRow {
  productId: string;
  name: string;
  sku: string | null;
  brand: string | null;
  clientId: string | null;
  audience: string;
  beforeUsd: number | null;
  afterUsd: number | null;
  diffUsd: number;
  /** Variación en %, null si antes no tenía precio. */
  pct: number | null;
}

export interface ReviewSummary {
  affectedProducts: number;
  affectedRows: number;
  up: number;
  down: number;
  totalBeforeUsd: number;
  totalAfterUsd: number;
  audiences: Array<{ clientId: string | null; name: string; rows: number }>;
  /** Filas guardadas (puede haber un tope); `affectedRows` es el total real. */
  storedRows: number;
}

/** Diferencias menores a medio centavo no cuentan (redondeo de punto flotante). */
const EPSILON = 0.005;
export const MAX_STORED_ROWS = 20_000;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function diffPrices(
  audiences: ReviewAudiencePrices[],
  meta: Map<string, ReviewProductMeta>,
  options: { maxRows?: number } = {}
): { rows: ReviewRow[]; summary: ReviewSummary } {
  const maxRows = options.maxRows ?? MAX_STORED_ROWS;
  const rows: ReviewRow[] = [];
  const affected = new Set<string>();
  let affectedRows = 0;
  let up = 0;
  let down = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  const perAudience: ReviewSummary["audiences"] = [];

  for (const audience of audiences) {
    let count = 0;
    const ids = new Set([...audience.before.keys(), ...audience.after.keys()]);
    for (const productId of ids) {
      const before = audience.before.get(productId) ?? null;
      const after = audience.after.get(productId) ?? null;
      const diff = (after ?? 0) - (before ?? 0);
      if (Math.abs(diff) < EPSILON && (before == null) === (after == null)) continue;
      count += 1;
      affectedRows += 1;
      affected.add(productId);
      if (diff > 0) up += 1;
      else if (diff < 0) down += 1;
      totalBefore += before ?? 0;
      totalAfter += after ?? 0;
      if (rows.length >= maxRows) continue;
      const info = meta.get(productId);
      rows.push({
        productId,
        name: info?.name ?? productId,
        sku: info?.sku ?? null,
        brand: info?.brand ?? null,
        clientId: audience.clientId,
        audience: audience.name,
        beforeUsd: before == null ? null : round2(before),
        afterUsd: after == null ? null : round2(after),
        diffUsd: round2(diff),
        pct: before && before > 0 ? round2((diff / before) * 100) : null,
      });
    }
    perAudience.push({ clientId: audience.clientId, name: audience.name, rows: count });
  }

  rows.sort((a, b) => Math.abs(b.diffUsd) - Math.abs(a.diffUsd) || a.name.localeCompare(b.name, "es"));
  return {
    rows,
    summary: {
      affectedProducts: affected.size,
      affectedRows,
      up,
      down,
      totalBeforeUsd: round2(totalBefore),
      totalAfterUsd: round2(totalAfter),
      audiences: perAudience,
      storedRows: rows.length,
    },
  };
}

type RuleLike = { id: string; clientId: string | null; [key: string]: unknown };

/** Firma de una regla para comparar antes/después (solo lo que mueve precios). */
function ruleSignature(rule: Record<string, unknown>): string {
  const keys = [
    "isActive",
    "scopeType",
    "scopeId",
    "clientId",
    "productId",
    "marginPercent",
    "markupMultiplier",
    "discountPercent",
    "groupId",
    "isExemption",
    "priority",
  ];
  return keys.map((k) => String(rule[k] ?? "")).join("|");
}

/**
 * Qué clientes tocan los cambios de reglas: null = alguna regla general
 * (entonces hay que mirar la lista general y a todos los clientes con
 * condiciones propias, porque también caen en las generales).
 */
export function touchedAudiences(before: RuleLike[], after: RuleLike[]): Set<string | null> {
  const touched = new Set<string | null>();
  const beforeById = new Map(before.map((r) => [r.id, r]));
  const afterById = new Map(after.map((r) => [r.id, r]));
  for (const [id, rule] of afterById) {
    const prev = beforeById.get(id);
    if (!prev || ruleSignature(prev) !== ruleSignature(rule)) {
      touched.add(rule.clientId ?? null);
      if (prev) touched.add(prev.clientId ?? null);
    }
  }
  for (const [id, rule] of beforeById) if (!afterById.has(id)) touched.add(rule.clientId ?? null);
  return touched;
}
