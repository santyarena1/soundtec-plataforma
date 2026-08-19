import type { RuleScopeType } from "@prisma/client";
import { formatDate } from "@/lib/utils";

export const RULE_TARGETS = [
  { value: "ALL", label: "Todo el catálogo" },
  { value: "BRAND", label: "Una marca" },
  { value: "PRODUCT", label: "Un producto" },
  { value: "CATEGORY", label: "Una categoría" },
  { value: "FAMILY", label: "Una familia" },
  { value: "DISTRIBUTOR", label: "Un proveedor" },
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
    percent: input.percent,
    markupMultiplier: input.markupMultiplier ?? null,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : input.createdAt.toISOString(),
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : input.updatedAt.toISOString(),
  };
}
