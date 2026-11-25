/**
 * Borrador de precios de la edición rápida: qué cambió, cómo se simula con el
 * motor de precios real y qué va directo y qué pasa por «Revisión de cambios».
 *
 * Convención del sistema (la misma que la ficha del admin):
 *  - DIRECTO: los datos propios del producto (costo, proveedor, coeficientes,
 *    impuestos, descuento propio, «requiere cotización») y su markup propio
 *    (regla de este producto solo). Mueven el precio de este producto y nada más.
 *  - REVISIÓN: cualquier regla de alcance más amplio (marca, rubro, serie,
 *    proveedor, general) y todas las reglas de descuento. Quedan pendientes en
 *    Precios › Revisión de cambios hasta que alguien las aplica.
 */
import type { ProductPricingInput } from "@/lib/pricing";

/** Campos propios del producto que se editan en la pestaña Precios. */
export interface ProductPriceFields {
  baseCostUsd: number;
  distributorId: string | null;
  coefNac: number | null;
  coefVta: number | null;
  coefVtaFob: number | null;
  tariffDutyPercent: number | null;
  ivaPercent: number | null;
  impIntPercent: number | null;
  discountPercent: number | null;
  requiresQuote: boolean;
}

export const PRODUCT_PRICE_FIELDS = [
  "baseCostUsd",
  "distributorId",
  "coefNac",
  "coefVta",
  "coefVtaFob",
  "tariffDutyPercent",
  "ivaPercent",
  "impIntPercent",
  "discountPercent",
  "requiresQuote",
] as const satisfies ReadonlyArray<keyof ProductPriceFields>;

export type RuleKind = "margin" | "discount";

/** Regla que hoy toca al producto (de loadProductPricingRules). */
export interface DraftRule {
  id: string;
  kind: RuleKind;
  scope: string;
  /** Markup (×) en márgenes, % en descuentos. */
  value: number;
  origin: "catalog" | "soundtube" | "rule";
}

export interface PriceDraft {
  fields: ProductPriceFields;
  /** Markup propio: número = fijarlo, null = sin markup propio. */
  ownMarkup: number | null;
  /** Valores simulados para reglas existentes (id → valor). */
  ruleValues: Record<string, number>;
}

export type RuleChange =
  | { route: "direct-own-markup"; value: number }
  | { route: "clear-own-markup" }
  /** Regla PRODUCT de este producto solo (p. ej. MUP de la lista SoundTube): directo, como en la ficha. */
  | { route: "direct-product-rule"; ruleId: string; value: number }
  | { route: "review"; ruleId: string; kind: RuleKind; value: number };

export interface PriceSavePlan {
  /** Campos del producto que cambian (van directo). */
  fields: Partial<ProductPriceFields>;
  changes: RuleChange[];
  /** Algo para guardar. */
  hasChanges: boolean;
  /** Algo queda pendiente en Revisión de cambios. */
  needsReview: boolean;
}

const EPS = 1e-6;
const same = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < EPS : (a ?? null) === (b ?? null);

/** El borrador aplicado a la entrada del motor de precios (sin tocar el original). */
export function applyPriceDraft(input: ProductPricingInput, fields: ProductPriceFields): ProductPricingInput {
  return {
    ...input,
    baseCostUsd: fields.baseCostUsd,
    distributorId: fields.distributorId,
    coefNac: fields.coefNac,
    coefVta: fields.coefVta,
    coefVtaFob: fields.coefVtaFob,
    tariffDutyPercent: fields.tariffDutyPercent,
    ivaPercent: fields.ivaPercent,
    impIntPercent: fields.impIntPercent,
    productDiscountPercent: fields.discountPercent,
  };
}

type SimRule = {
  id: string;
  scopeType: string;
  scopeId: string | null;
  productId: string | null;
  clientId: string | null;
  groupId: string | null;
  isExemption: boolean;
};

const isOwnCatalogRule = (r: SimRule, productId: string) =>
  r.scopeType === "PRODUCT" && !r.clientId && !r.isExemption && r.productId === productId && !!r.groupId?.startsWith("catalogo");

/**
 * Reglas de margen como quedarían: valores simulados en las reglas existentes y
 * el markup propio (regla del producto que gana sobre las demás generales).
 * `toValue` arma una regla con el markup pedido (el llamador decide el tipo numérico).
 */
export function simulateMarginRules<R extends SimRule>(
  rules: readonly R[],
  productId: string,
  ownMarkup: number | null,
  ruleValues: Record<string, number>,
  withMarkup: (rule: R, markup: number) => R,
  makeOwn: (markup: number) => R
): R[] {
  const rest = rules
    .filter((r) => !isOwnCatalogRule(r, productId))
    .map((r) => (ruleValues[r.id] != null ? withMarkup(r, ruleValues[r.id]) : r));
  return ownMarkup != null ? [makeOwn(ownMarkup), ...rest] : rest;
}

/** Reglas de descuento con los valores simulados. */
export function simulateDiscountRules<R extends { id: string }>(rules: readonly R[], ruleValues: Record<string, number>, withPercent: (rule: R, percent: number) => R): R[] {
  return rules.map((r) => (ruleValues[r.id] != null ? withPercent(r, ruleValues[r.id]) : r));
}

/** Qué se guarda directo y qué va a Revisión de cambios. */
export function planPriceSave(
  current: { fields: ProductPriceFields; ownMarkup: number | null; rules: readonly DraftRule[] },
  draft: PriceDraft
): PriceSavePlan {
  const fields: Partial<ProductPriceFields> = {};
  for (const key of PRODUCT_PRICE_FIELDS) {
    if (!same(current.fields[key], draft.fields[key])) (fields as Record<string, unknown>)[key] = draft.fields[key];
  }
  const changes: RuleChange[] = [];
  if (!same(current.ownMarkup, draft.ownMarkup)) {
    changes.push(draft.ownMarkup == null ? { route: "clear-own-markup" } : { route: "direct-own-markup", value: draft.ownMarkup });
  }
  for (const rule of current.rules) {
    const next = draft.ruleValues[rule.id];
    if (next == null || same(rule.value, next)) continue;
    // El markup propio se maneja arriba (ownMarkup).
    if (rule.origin === "catalog") continue;
    if (rule.kind === "margin" && rule.scope === "PRODUCT") {
      changes.push({ route: "direct-product-rule", ruleId: rule.id, value: next });
    } else {
      changes.push({ route: "review", ruleId: rule.id, kind: rule.kind, value: next });
    }
  }
  return {
    fields,
    changes,
    hasChanges: Object.keys(fields).length > 0 || changes.length > 0,
    needsReview: changes.some((c) => c.route === "review"),
  };
}

/** Markup que da un precio final buscado (con el descuento vigente). null si no hay costo. */
export function markupForTargetPrice(targetUsd: number, costoNacUsd: number, discountPercent: number): number | null {
  if (!(targetUsd > 0) || !(costoNacUsd > 0) || discountPercent >= 100) return null;
  return Math.round((targetUsd / (costoNacUsd * (1 - discountPercent / 100))) * 10000) / 10000;
}

/** Número de un input en castellano («2,75»). Vacío = null. */
export function parseDecimal(value: string): number | null {
  const clean = value.trim().replace(/\s/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
