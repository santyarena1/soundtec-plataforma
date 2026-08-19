import type { RuleScopeType } from "@prisma/client";
import { formatDate } from "@/lib/utils";

export const RULE_TARGETS = [
  { value: "ALL", label: "Todo el catálogo" },
  { value: "BRAND", label: "Marca(s)" },
  { value: "PRODUCT", label: "Producto(s)" },
  { value: "CATEGORY", label: "Categoría(s)" },
  { value: "FAMILY", label: "Familia(s)" },
  { value: "DISTRIBUTOR", label: "Proveedor(es)" },
] as const;

export type RuleTarget = (typeof RULE_TARGETS)[number]["value"];

export const SCOPE_LABEL: Record<string, string> = {
  GLOBAL: "Todos",
  CLIENT: "Cliente",
  BRAND: "Marca",
  DISTRIBUTOR: "Proveedor",
  CATEGORY: "Categoría",
  FAMILY: "Familia",
  PRODUCT: "Producto",
};

export function marginPercentToMarkup(percent: number) {
  return 1 + percent / 100;
}

export function markupToMarginPercent(markup: number) {
  return (markup - 1) * 100;
}

export function formatMarkup(value: number) {
  return `× ${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export function formatMarginPercent(value: number) {
  return `${value.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

/** Precio de lista si el costo es 100. Markup 2.75 → 275, nunca 375. */
export function listFromCost100(mode: "markup" | "margin", value: number) {
  const multiplier = mode === "markup" ? value : marginPercentToMarkup(value);
  return multiplier * 100;
}

/** Prioridad interna: más específico = número más bajo. No se muestra en la UI. */
export function autoPriority(scopeType: RuleScopeType, hasClient: boolean) {
  const rank: Record<string, number> = {
    PRODUCT: 10,
    BRAND: 20,
    CATEGORY: 30,
    FAMILY: 40,
    DISTRIBUTOR: 50,
    CLIENT: 60,
    GLOBAL: 80,
  };
  const base = rank[scopeType] ?? 100;
  return hasClient && scopeType !== "CLIENT" && scopeType !== "GLOBAL" ? base : base + 5;
}

export function resolveRuleScope(input: {
  audience: "all" | "client";
  target: RuleTarget;
  clientId?: string | null;
  scopeId?: string | null;
}): { ok: true; scopeType: RuleScopeType; clientId: string | null; scopeId: string | null } | { ok: false; error: string } {
  const clientId = input.audience === "client" ? input.clientId || null : null;
  if (input.audience === "client" && !clientId) {
    return { ok: false, error: "Elegí el cliente." };
  }
  if (input.target === "ALL") {
    return {
      ok: true,
      scopeType: clientId ? "CLIENT" : "GLOBAL",
      clientId,
      scopeId: null,
    };
  }
  const scopeId = input.scopeId || null;
  if (!scopeId) {
    return { ok: false, error: "Elegí el recurso (marca, producto, etc.)." };
  }
  return {
    ok: true,
    scopeType: input.target as RuleScopeType,
    clientId,
    scopeId,
  };
}

export function autoRuleName(input: {
  kind: "margin" | "discount";
  mode?: "margin" | "markup";
  value: number;
  audience: "all" | "client";
  clientName?: string | null;
  target: RuleTarget;
  resourceName?: string | null;
}) {
  const valueLabel =
    input.kind === "margin" && input.mode === "markup"
      ? `Markup ${formatMarkup(input.value)}`
      : input.kind === "margin"
        ? `Margen ${formatMarginPercent(input.value)}`
        : `Descuento ${formatMarginPercent(input.value)}`;
  const who = input.audience === "client" ? input.clientName || "cliente" : "todos";
  const what = input.target === "ALL" ? "catálogo" : input.resourceName || SCOPE_LABEL[input.target] || input.target;
  return `${valueLabel} · ${who} · ${what}`.slice(0, 200);
}

export function describeRuleAppliesTo(input: {
  scopeType: string;
  scopeId: string | null;
  clientId: string | null;
  clientName?: string | null;
  resourceName?: string | null;
}) {
  const resource = input.resourceName || null;
  const scope = SCOPE_LABEL[input.scopeType] || input.scopeType;
  const who = input.clientId ? input.clientName || "Un cliente" : "Todos los clientes";
  if (input.scopeType === "GLOBAL" || input.scopeType === "CLIENT") {
    return `${who} · todo el catálogo`;
  }
  return `${who} · ${scope}${resource ? `: ${resource}` : ""}`;
}

export function scopeTypeToForm(
  scopeType: string,
  hasClient: boolean
): { audience: "all" | "client"; target: RuleTarget } {
  const audience: "all" | "client" = hasClient ? "client" : "all";
  if (scopeType === "GLOBAL" || scopeType === "CLIENT") {
    return { audience, target: "ALL" };
  }
  const targets = new Set<RuleTarget>(["BRAND", "PRODUCT", "CATEGORY", "FAMILY", "DISTRIBUTOR"]);
  if (targets.has(scopeType as RuleTarget)) {
    return { audience, target: scopeType as RuleTarget };
  }
  return { audience, target: "ALL" };
}

export function formatRuleTimestamp(createdAt: string | Date, updatedAt?: string | Date | null) {
  const created = formatDate(createdAt);
  if (!updatedAt) return `Creada ${created}`;
  const createdMs = new Date(createdAt).getTime();
  const updatedMs = new Date(updatedAt).getTime();
  if (Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs - createdMs > 2000) {
    return `Creada ${created} · Editada ${formatDate(updatedAt)}`;
  }
  return `Creada ${created}`;
}

export function toFiniteNumber(value: unknown, fallback = 0) {
  if (value == null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? n : fallback;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return new Date(0).toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  try {
    const parsed = new Date(value as Date);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  } catch {
    // ignore
  }
  return new Date(0).toISOString();
}

export function toPricingRuleRow(input: {
  id: string;
  name: string;
  scopeType: string;
  scopeId: string | null;
  clientId: string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  percent: number;
  markupMultiplier?: number | null;
  clientName?: string | null;
  resourceName?: string | null;
  groupId?: string | null;
  isExemption?: boolean;
}) {
  return {
    id: input.id,
    name: input.name,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    clientId: input.clientId,
    clientName: input.clientName ?? null,
    resourceName: input.resourceName ?? null,
    isActive: input.isActive,
    percent: toFiniteNumber(input.percent),
    markupMultiplier: (() => {
      if (input.markupMultiplier == null) return null;
      const n = toFiniteNumber(input.markupMultiplier);
      return n > 0 ? n : null;
    })(),
    groupId: input.groupId ?? null,
    isExemption: Boolean(input.isExemption),
    excludedProductIds: [] as string[],
    excludedProductLabels: [] as string[],
    createdAt: toIso(input.createdAt),
    updatedAt: toIso(input.updatedAt),
  };
}

/** Saca las subreglas de excepción de la lista y las cuelga del grupo padre. */
export function attachRuleExemptions<T extends ReturnType<typeof toPricingRuleRow>>(rows: T[]): T[] {
  const exemptions = rows.filter((row) => row.isExemption && row.scopeType === "PRODUCT" && row.scopeId);
  const byGroup = new Map<string, T[]>();
  for (const row of exemptions) {
    if (!row.groupId) continue;
    const list = byGroup.get(row.groupId) || [];
    list.push(row);
    byGroup.set(row.groupId, list);
  }
  return rows
    .filter((row) => !row.isExemption)
    .map((row) => {
      const extras = row.groupId ? byGroup.get(row.groupId) || [] : [];
      const excludedProductIds = [...new Set(extras.map((item) => item.scopeId).filter(Boolean))] as string[];
      const excludedProductLabels = [...new Set(extras.map((item) => item.resourceName).filter(Boolean))] as string[];
      return { ...row, excludedProductIds, excludedProductLabels };
    });
}

export function describeRuleExclusions(row: {
  excludedProductIds?: string[] | null;
  excludedProductLabels?: string[] | null;
}) {
  const count = row.excludedProductIds?.length || 0;
  if (count === 0) return "";
  const labels = row.excludedProductLabels || [];
  const shown = labels.slice(0, 3).join(", ");
  const extra = labels.length > 3 ? ` +${labels.length - 3}` : "";
  const noun = count === 1 ? "producto" : "productos";
  return shown ? `Exceptúa ${count} ${noun}: ${shown}${extra}` : `Exceptúa ${count} ${noun}`;
}

export type GroupedPricingRow =
  | { type: "single"; row: ReturnType<typeof toPricingRuleRow> }
  | { type: "group"; groupId: string; rows: ReturnType<typeof toPricingRuleRow>[] };

export function groupPricingRows(rows: ReturnType<typeof toPricingRuleRow>[]): GroupedPricingRow[] {
  const visible = rows.filter((row) => !row.isExemption);
  const grouped = new Map<string, ReturnType<typeof toPricingRuleRow>[]>();
  for (const row of visible) {
    if (!row.groupId) continue;
    const list = grouped.get(row.groupId) || [];
    list.push(row);
    grouped.set(row.groupId, list);
  }
  const seen = new Set<string>();
  const result: GroupedPricingRow[] = [];
  for (const row of visible) {
    if (!row.groupId || (grouped.get(row.groupId)?.length || 0) < 2) {
      result.push({ type: "single", row });
      continue;
    }
    if (seen.has(row.groupId)) continue;
    seen.add(row.groupId);
    result.push({ type: "group", groupId: row.groupId, rows: grouped.get(row.groupId) || [] });
  }
  return result;
}

export function describeRuleGroup(rows: ReturnType<typeof toPricingRuleRow>[]) {
  if (rows.length === 0) return "";
  const clientNames = [...new Set(rows.map((row) => (row.clientId ? row.clientName || "Un cliente" : "Todos los clientes")))];
  const who = clientNames.length === 1 ? clientNames[0] : `${clientNames.length} clientes`;
  if (rows[0].scopeType === "GLOBAL" || rows[0].scopeType === "CLIENT") {
    return `${who} · todo el catálogo`;
  }
  const plural: Record<string, string> = {
    BRAND: "marcas",
    PRODUCT: "productos",
    CATEGORY: "categorías",
    FAMILY: "familias",
    DISTRIBUTOR: "proveedores",
  };
  const resources = [...new Set(rows.map((row) => row.resourceName).filter(Boolean))] as string[];
  const noun = plural[rows[0].scopeType] || "ítems";
  const shown = resources.slice(0, 4).join(", ");
  const extra = resources.length > 4 ? ` +${resources.length - 4}` : "";
  return `${who} · ${resources.length || rows.length} ${noun}${shown ? `: ${shown}${extra}` : ""}`;
}
