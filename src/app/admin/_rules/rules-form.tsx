"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { SearchablePick } from "@/components/admin/searchable-pick";
import { upsertMarginRule, upsertDiscountRule } from "@/server/actions/pricing-rules";
import {
  RULE_TARGETS,
  autoRuleName,
  formatMarginPercent,
  formatMarkup,
  listFromCost100,
  marginPercentToMarkup,
  markupToMarginPercent,
  scopeTypeToForm,
  type RuleTarget,
} from "@/lib/pricing-scope";
import type { PricingRuleRow } from "@/components/admin/pricing-rules-table";

type ClientOpt = { id: string; name: string; companyName?: string | null };
type Named = { id: string; name: string };

function initialMode(row?: PricingRuleRow | null): "margin" | "markup" {
  if (row?.markupMultiplier != null && row.markupMultiplier > 0) return "markup";
  if (row) return "margin";
  return "markup";
}

function initialValue(type: "margin" | "discount", row?: PricingRuleRow | null) {
  if (!row) return type === "margin" ? "1.35" : "10";
  if (type === "margin" && row.markupMultiplier != null && row.markupMultiplier > 0) {
    return String(row.markupMultiplier);
  }
  return String(row.percent);
}

export function RulesForm({
  type,
  clients,
  brands,
  distributors,
  categories,
  families,
  products,
  lockedClientId,
  initial,
  onSaved,
  onCancel,
}: {
  type: "margin" | "discount";
  clients: ClientOpt[];
  brands: Named[];
  distributors: Named[];
  categories: Named[];
  families: Named[];
  products: { id: string; normalizedName: string }[];
  lockedClientId?: string;
  initial?: PricingRuleRow | null;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const formSeed = initial ? scopeTypeToForm(initial.scopeType, Boolean(initial.clientId)) : null;
  const [audience, setAudience] = useState<"all" | "client">(
    lockedClientId ? "client" : formSeed?.audience || "all"
  );
  const [clientId, setClientId] = useState(lockedClientId || initial?.clientId || "");
  const [target, setTarget] = useState<RuleTarget>(formSeed?.target || "ALL");
  const [scopeId, setScopeId] = useState(initial?.scopeId || "");
  const [mode, setMode] = useState<"margin" | "markup">(type === "margin" ? initialMode(initial) : "margin");
  const [value, setValue] = useState(initialValue(type, initial));
  const [name, setName] = useState(initial?.name || "");
  const [active, setActive] = useState(initial?.isActive ?? true);
  const [advanced, setAdvanced] = useState(Boolean(initial));
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(initial?.id);

  const resourceOptions = useMemo(() => {
    switch (target) {
      case "BRAND":
        return brands;
      case "DISTRIBUTOR":
        return distributors;
      case "CATEGORY":
        return categories;
      case "FAMILY":
        return families;
      case "PRODUCT":
        return products.map((p) => ({ id: p.id, name: p.normalizedName }));
      default:
        return [];
    }
  }, [target, brands, distributors, categories, families, products]);

  const numericValue = Number(value);
  const parsedOk = Number.isFinite(numericValue) && numericValue !== 0;
  const preview =
    type === "margin" && parsedOk
      ? mode === "markup"
        ? `${formatMarkup(numericValue)} · costo 100 → lista ${listFromCost100("markup", numericValue).toLocaleString("es-AR", { maximumFractionDigits: 2 })}. El 1 no se suma: ${numericValue.toLocaleString("es-AR", { maximumFractionDigits: 4 })} es ×${numericValue.toLocaleString("es-AR", { maximumFractionDigits: 4 })}, no ×${(1 + numericValue).toLocaleString("es-AR", { maximumFractionDigits: 4 })}.`
        : `Margen ${formatMarginPercent(numericValue)} = ${formatMarkup(marginPercentToMarkup(numericValue))} · costo 100 → lista ${listFromCost100("margin", numericValue).toLocaleString("es-AR", { maximumFractionDigits: 2 })}.`
      : null;

  function onTargetChange(next: RuleTarget) {
    setTarget(next);
    setScopeId("");
  }

  function onModeChange(next: "margin" | "markup") {
    const current = Number(value);
    if (next === mode) return;
    if (Number.isFinite(current) && current !== 0) {
      setValue(next === "markup" ? marginPercentToMarkup(current).toFixed(2) : markupToMarginPercent(current).toFixed(2));
    } else {
      setValue(next === "markup" ? "1.35" : "35");
    }
    setMode(next);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (audience === "client" && !clientId) {
      setError("Elegí el cliente.");
      return;
    }
    if (target !== "ALL" && !scopeId) {
      setError("Elegí el recurso de la lista mientras escribís.");
      return;
    }
    const clientName = clients.find((c) => c.id === clientId)?.companyName || clients.find((c) => c.id === clientId)?.name;
    const resourceName = resourceOptions.find((o) => o.id === scopeId)?.name;
    const generated = autoRuleName({
      kind: type,
      mode: type === "margin" ? mode : undefined,
      value: numericValue,
      audience,
      clientName,
      target,
      resourceName,
    });
    const fd = new FormData();
    if (initial?.id) fd.set("id", initial.id);
    fd.set("audience", audience);
    fd.set("target", target);
    fd.set("clientId", audience === "client" ? clientId : "");
    fd.set("scopeId", target === "ALL" ? "" : scopeId);
    fd.set("pricingMode", type === "margin" ? mode : "margin");
    fd.set("percent", String(numericValue));
    fd.set("name", name.trim() || generated);
    fd.set("isActive", active ? "on" : "");
    start(async () => {
      try {
        const action = type === "margin" ? upsertMarginRule : upsertDiscountRule;
        const result = await action(fd);
        if (!result.ok) {
          setError(result.error || "No se pudo guardar.");
          return;
        }
        toast.success(
          editing
            ? type === "margin"
              ? "Regla de precio actualizada."
              : "Descuento actualizado."
            : type === "margin"
              ? "Regla de precio creada."
              : "Descuento creado."
        );
        if (!editing) {
          setName("");
        }
        onSaved?.();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label required>¿Para quién?</Label>
          {lockedClientId ? (
            <p className="mt-2 text-sm">
              {clients.find((c) => c.id === lockedClientId)?.companyName ||
                clients.find((c) => c.id === lockedClientId)?.name ||
                "Este cliente"}
            </p>
          ) : (
            <div className="mt-1.5 inline-flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm ${audience === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => {
                  setAudience("all");
                  setClientId("");
                }}
              >
                Todos los clientes
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm ${audience === "client" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setAudience("client")}
              >
                Un cliente
              </button>
            </div>
          )}
        </div>
        {audience === "client" && !lockedClientId ? (
          <SearchablePick
            label="Cliente"
            options={clients.map((c) => ({ id: c.id, name: c.companyName || c.name }))}
            value={clientId}
            onChange={setClientId}
            placeholder="Escribí el cliente…"
            required
          />
        ) : (
          <div />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label required>¿Sobre qué?</Label>
          <Select value={target} onChange={(e) => onTargetChange(e.target.value as RuleTarget)}>
            {RULE_TARGETS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
        {target !== "ALL" ? (
          <SearchablePick
            key={target}
            label={RULE_TARGETS.find((item) => item.value === target)?.label || "Recurso"}
            options={resourceOptions}
            value={scopeId}
            onChange={setScopeId}
            placeholder="Escribí y elegí de la lista…"
            required
          />
        ) : (
          <p className="self-end text-sm text-muted-foreground">Aplica a todo el catálogo de ese alcance.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {type === "margin" ? (
          <div>
            <Label required>¿Cómo lo cargás?</Label>
            <div className="mt-1.5 inline-flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm ${mode === "markup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => onModeChange("markup")}
              >
                Markup ×
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm ${mode === "margin" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => onModeChange("margin")}
              >
                Margen %
              </button>
            </div>
          </div>
        ) : (
          <div>
            <Label required>Descuento</Label>
            <p className="mt-2 text-sm text-muted-foreground">Porcentaje que se resta al precio de lista.</p>
          </div>
        )}
        <div>
          <Label required>{type === "discount" ? "Descuento %" : mode === "markup" ? "Markup" : "Margen %"}</Label>
          <Input
            type="number"
            step={type === "margin" && mode === "markup" ? "0.01" : "0.1"}
            min={type === "margin" && mode === "markup" ? "0.01" : "0"}
            max={type === "margin" && mode === "markup" ? "20" : "100"}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type === "discount" ? "10" : mode === "markup" ? "1.35" : "35"}
          />
          {preview ? <p className="mt-1 text-[12px] text-muted-foreground">{preview}</p> : null}
        </div>
      </div>

      <div>
        <button
          type="button"
          className="text-xs font-medium text-primary"
          onClick={() => setAdvanced((v) => !v)}
        >
          {advanced ? "Ocultar opciones" : "Personalización profunda (nombre interno)"}
        </button>
        {advanced ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nombre interno</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Si lo dejás vacío, se arma solo."
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Regla activa
            </label>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : <span />}
        <div className="flex items-center gap-2">
          {editing && onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Guardar cambios" : "Crear regla"}
          </Button>
        </div>
      </div>
    </form>
  );
}
