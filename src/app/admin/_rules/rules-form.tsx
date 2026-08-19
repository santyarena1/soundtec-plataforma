"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { SearchablePick } from "@/components/admin/searchable-pick";
import { upsertMarginRule, upsertDiscountRule } from "@/server/actions/pricing-rules";
import { cn } from "@/lib/utils";
import {
  RULE_TARGETS,
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

function seedRows(initial?: PricingRuleRow | null, editingGroup?: boolean) {
  if (editingGroup && initial?.members?.length) return initial.members;
  return initial ? [initial] : [];
}

function uniqueIds(rows: PricingRuleRow[], pick: (row: PricingRuleRow) => string | null | undefined) {
  return [...new Set(rows.map(pick).filter((id): id is string => Boolean(id)))];
}

function Field({
  label,
  required,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label required={required} className="block h-5 leading-5">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex h-10 w-full rounded-md border border-input bg-card p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "flex-1 rounded-[5px] px-2 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Readout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-10 items-center rounded-md border border-dashed border-border bg-secondary/40 px-3 text-sm text-muted-foreground">
      {children}
    </div>
  );
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
  editingGroup,
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
  editingGroup?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const seeded = seedRows(initial, editingGroup);
  const seedHasClient = seeded.some((row) => Boolean(row.clientId));
  const formSeed = initial ? scopeTypeToForm(initial.scopeType, seedHasClient || Boolean(initial.clientId)) : null;
  const [audience, setAudience] = useState<"all" | "client">(
    lockedClientId ? "client" : formSeed?.audience || "all"
  );
  const [clientIds, setClientIds] = useState<string[]>(
    lockedClientId ? [lockedClientId] : uniqueIds(seeded, (row) => row.clientId)
  );
  const [target, setTarget] = useState<RuleTarget>(formSeed?.target || "ALL");
  const [scopeIds, setScopeIds] = useState<string[]>(uniqueIds(seeded, (row) => row.scopeId));
  const [mode, setMode] = useState<"margin" | "markup">(type === "margin" ? initialMode(initial) : "margin");
  const [value, setValue] = useState(initialValue(type, initial));
  const [name, setName] = useState(editingGroup ? "" : initial?.name || "");
  const [active, setActive] = useState(initial?.isActive ?? true);
  const [advanced, setAdvanced] = useState(Boolean(initial) && !editingGroup);
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
      : type === "discount" && parsedOk
        ? `Se resta ${formatMarginPercent(numericValue)} al precio de lista.`
        : null;

  const comboCount =
    (audience === "all" || lockedClientId ? 1 : Math.max(clientIds.length, 0)) *
    (target === "ALL" ? 1 : Math.max(scopeIds.length, 0));
  const comboParts = [
    audience === "client" && !lockedClientId && clientIds.length > 1 ? `${clientIds.length} clientes` : null,
    target !== "ALL" && scopeIds.length > 1
      ? `${scopeIds.length} ${RULE_TARGETS.find((item) => item.value === target)?.label.toLowerCase() || "recursos"}`
      : null,
  ].filter(Boolean);
  const comboHint = editingGroup
    ? " Los cambios se aplican a todas las subreglas. Podés agregar o sacar marcas/clientes y se actualiza el grupo entero."
    : editing && initial?.groupId
      ? " Solo se actualiza esta subregla. El resto del grupo queda igual."
      : comboCount > 1
        ? ` Se guarda como 1 regla con ${comboCount} subreglas${comboParts.length ? ` (${comboParts.join(" × ")})` : ""}. Después podés editar una sola o todo el grupo.`
        : "";

  function onTargetChange(next: RuleTarget) {
    setTarget(next);
    setScopeIds([]);
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
    if (audience === "client" && !lockedClientId && clientIds.length === 0) {
      setError("Elegí al menos un cliente.");
      return;
    }
    if (target !== "ALL" && scopeIds.length === 0) {
      setError("Elegí al menos un recurso de la lista.");
      return;
    }
    const fd = new FormData();
    if (initial?.id) fd.set("id", initial.id);
    if (initial?.groupId) fd.set("groupId", initial.groupId);
    if (editingGroup) fd.set("replaceGroup", "on");
    fd.set("audience", audience);
    fd.set("target", target);
    if (lockedClientId) fd.append("clientIds", lockedClientId);
    else if (audience === "client") for (const id of clientIds) fd.append("clientIds", id);
    if (target !== "ALL") for (const id of scopeIds) fd.append("scopeIds", id);
    fd.set("pricingMode", type === "margin" ? mode : "margin");
    fd.set("percent", String(numericValue));
    fd.set("name", name.trim());
    fd.set("isActive", active ? "on" : "");
    start(async () => {
      try {
        const action = type === "margin" ? upsertMarginRule : upsertDiscountRule;
        const result = await action(fd);
        if (!result.ok) {
          setError(result.error || "No se pudo guardar.");
          return;
        }
        const count = result.count || 1;
        toast.success(
          editingGroup
            ? `Se actualizó el grupo (${count} subregla${count === 1 ? "" : "s"}).`
            : count > 1
              ? `Se guardó 1 regla con ${count} subreglas.`
              : editing
                ? type === "margin"
                  ? "Regla de precio actualizada."
                  : "Descuento actualizado."
                : type === "margin"
                  ? "Regla de precio creada."
                  : "Descuento creado."
        );
        if (!editing) {
          setName("");
          setScopeIds([]);
        }
        onSaved?.();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  const lockedName =
    clients.find((c) => c.id === lockedClientId)?.companyName ||
    clients.find((c) => c.id === lockedClientId)?.name ||
    "Este cliente";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-2">
        {lockedClientId ? (
          <>
            <Field label="Cliente" required>
              <Readout>{lockedName}</Readout>
            </Field>
            <Field label="Alcance">
              <Readout>Solo este cliente.</Readout>
            </Field>
          </>
        ) : (
          <>
            <Field label="¿Para quién?" required>
              <Segmented
                value={audience}
                onChange={(next) => {
                  setAudience(next);
                  if (next === "all") setClientIds([]);
                }}
                options={[
                  { value: "all", label: "Todos los clientes" },
                  { value: "client", label: "Uno o más clientes" },
                ]}
              />
            </Field>
            {audience === "client" ? (
              <SearchablePick
                label="Clientes"
                options={clients.map((c) => ({ id: c.id, name: c.companyName || c.name }))}
                values={clientIds}
                onValuesChange={setClientIds}
                placeholder="Escribí y marcá uno o más…"
                required
                multiple
              />
            ) : (
              <Field label="Cliente">
                <Readout>Aplica a todos. No hace falta elegir uno.</Readout>
              </Field>
            )}
          </>
        )}

        <Field label="¿Sobre qué?" required>
          <Select value={target} onChange={(e) => onTargetChange(e.target.value as RuleTarget)}>
            {RULE_TARGETS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>

        {target !== "ALL" ? (
          <SearchablePick
            key={target}
            label={RULE_TARGETS.find((item) => item.value === target)?.label || "Recursos"}
            options={resourceOptions}
            values={scopeIds}
            onValuesChange={setScopeIds}
            placeholder="Escribí y marcá todas las que quieras…"
            required
            multiple
          />
        ) : (
          <Field label="Recurso">
            <Readout>Todo el catálogo de ese alcance.</Readout>
          </Field>
        )}

        {type === "margin" ? (
          <Field label="¿Cómo lo cargás?" required>
            <Segmented
              value={mode}
              onChange={onModeChange}
              options={[
                { value: "markup", label: "Markup ×" },
                { value: "margin", label: "Margen %" },
              ]}
            />
          </Field>
        ) : (
          <Field label="Cómo aplica">
            <Readout>Se resta al precio de lista.</Readout>
          </Field>
        )}

        <Field
          label={type === "discount" ? "Descuento %" : mode === "markup" ? "Markup" : "Margen %"}
          required
        >
          <div className="relative">
            {type === "margin" && mode === "markup" ? (
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                ×
              </span>
            ) : null}
            <Input
              type="number"
              step={type === "margin" && mode === "markup" ? "0.01" : "0.1"}
              min={type === "margin" && mode === "markup" ? "0.01" : "0"}
              max={type === "margin" && mode === "markup" ? "20" : "100"}
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === "discount" ? "10" : mode === "markup" ? "2.75" : "35"}
              className={type === "margin" && mode === "markup" ? "pl-7" : "pr-8"}
            />
            {type === "discount" || mode === "margin" ? (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            ) : null}
          </div>
        </Field>

        {preview || comboHint ? (
          <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs leading-5 text-muted-foreground sm:col-span-2">
            {preview}
            {comboHint}
          </p>
        ) : null}
      </div>

      <div className="border-t border-border pt-4">
        <button
          type="button"
          className="text-xs font-medium text-primary"
          onClick={() => setAdvanced((v) => !v)}
        >
          {advanced ? "Ocultar opciones" : "Personalización profunda (nombre interno)"}
        </button>
        {advanced ? (
          <div className="mt-3 grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nombre interno">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Si lo dejás vacío, se arma solo."
                />
              </Field>
            </div>
            <label className="flex h-10 items-center gap-2 text-sm">
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
            {editingGroup
              ? "Guardar todo el grupo"
              : editing
                ? "Guardar cambios"
                : comboCount > 1
                  ? `Crear regla (${comboCount} subreglas)`
                  : "Crear regla"}
          </Button>
        </div>
      </div>
    </form>
  );
}
