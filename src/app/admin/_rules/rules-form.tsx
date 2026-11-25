"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { SearchablePick } from "@/components/admin/searchable-pick";
import { RubroPicker } from "@/components/admin/rubro-picker";
import type { CategoryNode } from "@/lib/category-tree";
import { upsertMarginRule, upsertDiscountRule } from "@/server/actions/pricing-rules";
import { PriceReviewNotice, type ReviewNoticeData } from "@/components/admin/price-review-notice";
import { PendingReviewChip } from "@/components/admin/pricing-rules-table";
import type { PendingRuleReview } from "@/lib/price-review/pending";
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
import { RulePreviewModal } from "./rule-preview-modal";
import { useRuleCategories, useRuleProducts } from "./use-rule-products";

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
  const rows = editingGroup && initial?.members?.length ? initial.members : initial ? [initial] : [];
  return rows.filter((row) => !row.isExemption);
}

function seedExcludedIds(initial?: PricingRuleRow | null) {
  if (initial?.excludedProductIds?.length) return [...new Set(initial.excludedProductIds)];
  const members = initial?.members?.length ? initial.members : initial ? [initial] : [];
  return [...new Set(members.flatMap((row) => row.excludedProductIds || []))];
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
  lines = [],
  products,
  lockedClientId,
  initial,
  editingGroup,
  onSaved,
  onCancel,
  presetTarget,
  presetScopeIds,
  presetClientId,
  presetGroupId,
  onReview,
  pendingReview,
}: {
  type: "margin" | "discount";
  clients: ClientOpt[];
  brands: Named[];
  distributors: Named[];
  /** Árbol de rubros (con cantidades) para el selector único de rubros. */
  categories: CategoryNode[];
  families: Named[];
  /** Series del fabricante (alcance LINE). Vacío = no se ofrece. */
  lines?: Named[];
  products: { id: string; normalizedName: string }[];
  lockedClientId?: string;
  initial?: PricingRuleRow | null;
  editingGroup?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
  presetTarget?: RuleTarget;
  presetScopeIds?: string[];
  presetClientId?: string | null;
  presetGroupId?: string;
  /**
   * Si está, el aviso de «quedó en Revisión de cambios» lo muestra la pantalla
   * (sobrevive a que el formulario se cierre o se vacíe). Si no, lo muestra el formulario.
   */
  onReview?: (notice: ReviewNoticeData) => void;
  /** La regla que se edita ya tiene un cambio esperando revisión. */
  pendingReview?: PendingRuleReview | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const seeded = seedRows(initial, editingGroup);
  const seedHasClient = seeded.some((row) => Boolean(row.clientId));
  const formSeed = initial ? scopeTypeToForm(initial.scopeType, seedHasClient || Boolean(initial.clientId)) : null;
  const [audience, setAudience] = useState<"all" | "client">(
    lockedClientId || presetClientId ? "client" : formSeed?.audience || "all"
  );
  const [clientIds, setClientIds] = useState<string[]>(
    lockedClientId ? [lockedClientId] : presetClientId ? [presetClientId] : uniqueIds(seeded, (row) => row.clientId)
  );
  const [target, setTarget] = useState<RuleTarget>(presetTarget || formSeed?.target || "ALL");
  const [scopeIds, setScopeIds] = useState<string[]>(presetScopeIds || uniqueIds(seeded, (row) => row.scopeId));
  const [excludedIds, setExcludedIds] = useState<string[]>(seedExcludedIds(initial));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mode, setMode] = useState<"margin" | "markup">(type === "margin" ? initialMode(initial) : "margin");
  const [value, setValue] = useState(initialValue(type, initial));
  const [name, setName] = useState(editingGroup ? "" : initial?.name || "");
  const [active, setActive] = useState(initial?.isActive ?? true);
  const [advanced, setAdvanced] = useState(Boolean(initial) && !editingGroup);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReviewNoticeData | null>(null);
  const editing = Boolean(initial?.id);
  // Aviso al salir con la regla a medio cargar o editar (compara contra cómo se abrió el formulario).
  const draft = { audience, clientIds, target, scopeIds, excludedIds, mode, value, name, active };
  const tracker = useUnsavedValue(draft);

  // La lista completa de productos se pide recién al elegir «Producto(s)».
  const { products: productOptions, loading: productsLoading, error: productsError } = useRuleProducts(target === "PRODUCT", products);
  // El árbol de rubros también se pide al elegir «Rubro(s)» (si la pantalla no lo trajo).
  const { categories: categoryNodes, error: categoriesError } = useRuleCategories(target === "CATEGORY", categories);
  const resourceOptions = useMemo(() => {
    switch (target) {
      case "BRAND":
        return brands;
      case "DISTRIBUTOR":
        return distributors;
      case "CATEGORY":
        return categoryNodes;
      case "FAMILY":
        return families;
      case "LINE":
        return lines;
      case "PRODUCT":
        return productOptions.map((p) => ({ id: p.id, name: p.normalizedName }));
      default:
        return [];
    }
  }, [target, brands, distributors, categoryNodes, families, lines, productOptions]);
  const targetOptions = RULE_TARGETS.filter(
    (item) => (!item.legacy || item.value === target) && (item.value !== "LINE" || lines.length > 0 || target === "LINE")
  );

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
  const exclusionHint =
    target !== "PRODUCT" && excludedIds.length > 0
      ? ` ${excludedIds.length} producto${excludedIds.length === 1 ? "" : "s"} exceptuado${excludedIds.length === 1 ? "" : "s"}: no les aplica esta regla.`
      : "";

  function onTargetChange(next: RuleTarget) {
    setTarget(next);
    setScopeIds([]);
    setExcludedIds([]);
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

  function formScopeOk() {
    if (audience === "client" && !lockedClientId && clientIds.length === 0) {
      setError("Elegí al menos un cliente.");
      return false;
    }
    if (target !== "ALL" && scopeIds.length === 0) {
      setError("Elegí al menos un recurso de la lista.");
      return false;
    }
    return true;
  }

  function openPreview() {
    setError(null);
    if (!formScopeOk()) return;
    setPreviewOpen(true);
  }

  function togglePreviewProduct(productId: string, included: boolean) {
    if (target === "PRODUCT") {
      setScopeIds((prev) =>
        included ? (prev.includes(productId) ? prev : [...prev, productId]) : prev.filter((id) => id !== productId)
      );
      return;
    }
    setExcludedIds((prev) =>
      included ? prev.filter((id) => id !== productId) : prev.includes(productId) ? prev : [...prev, productId]
    );
  }

  function restorePreviewProduct(productId: string) {
    setExcludedIds((prev) => prev.filter((id) => id !== productId));
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
    if (initial?.groupId || presetGroupId) fd.set("groupId", initial?.groupId || presetGroupId!);
    if (editingGroup) fd.set("replaceGroup", "on");
    fd.set("audience", audience);
    fd.set("target", target);
    if (lockedClientId) fd.append("clientIds", lockedClientId);
    else if (audience === "client") for (const id of clientIds) fd.append("clientIds", id);
    if (target !== "ALL") for (const id of scopeIds) fd.append("scopeIds", id);
    if (target !== "PRODUCT") for (const id of excludedIds) fd.append("excludeProductIds", id);
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
        if (result.unchanged) {
          toast.message("No había cambios para guardar.");
          tracker.markSaved(draft);
          if (editing) onSaved?.();
          return;
        }
        if (result.applied) {
          toast.success("Nombre guardado. No mueve ningún precio, así que no hizo falta revisión.");
          tracker.markSaved(draft);
          onSaved?.();
          router.refresh();
          return;
        }
        const review = result.review;
        if (!review) {
          router.refresh();
          return;
        }
        const reviewNotice: ReviewNoticeData = { ...review, title: editing ? "Cambio de regla" : "Regla nueva" };
        toast.message(
          review.reused
            ? "Ese mismo cambio ya estaba pendiente de revisión: no se duplicó."
            : review.affectedProducts === 0
              ? "No mueve ningún precio: aplicalo con un clic."
              : `Mueve el precio de ${review.affectedProducts} producto${review.affectedProducts === 1 ? "" : "s"}: quedó en Revisión de cambios.`
        );
        if (!editing) {
          setName("");
          setScopeIds([]);
          setExcludedIds([]);
          tracker.markSaved({ ...draft, name: "", scopeIds: [], excludedIds: [] });
        } else {
          tracker.markSaved(draft);
        }
        if (onReview) {
          // La pantalla muestra el aviso y marca la regla «pendiente de revisión» en la tabla.
          onReview(reviewNotice);
          if (editing) onSaved?.();
          return;
        }
        // Dentro de un modal: el aviso queda en el formulario. Una edición que no mueve
        // precios queda abierta para poder tocar «Aplicar».
        setNotice(reviewNotice);
        if (editing && review.affectedProducts > 0) onSaved?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        setError(
          /Server Components|digest property/i.test(message)
            ? "No se pudo guardar. Recargá la página e intentá de nuevo."
            : message || "No se pudo guardar."
        );
      }
    });
  }

  const lockedName =
    clients.find((c) => c.id === lockedClientId)?.companyName ||
    clients.find((c) => c.id === lockedClientId)?.name ||
    "Este cliente";

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-5">
      {pendingReview ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Esta regla ya tiene un cambio esperando revisión. Si calculás uno nuevo, reemplaza al anterior (el viejo queda descartado).{" "}
          <PendingReviewChip entry={pendingReview} />
        </div>
      ) : null}
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
            {targetOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>

        {target === "CATEGORY" ? (
          <Field label="Rubros (cada uno con sus subrubros)" required>
            <RubroPicker nodes={categoryNodes} multiple values={scopeIds} onValuesChange={setScopeIds} />
            {categoriesError ? <p className="text-xs text-destructive">No se pudo cargar el árbol de rubros. Recargá la página.</p> : null}
          </Field>
        ) : target !== "ALL" ? (
          <SearchablePick
            key={target}
            label={RULE_TARGETS.find((item) => item.value === target)?.label || "Recursos"}
            options={resourceOptions}
            values={scopeIds}
            onValuesChange={setScopeIds}
            placeholder={
              target === "PRODUCT" && productsLoading
                ? "Cargando productos…"
                : target === "PRODUCT" && productsError
                  ? "No se pudo cargar la lista de productos. Recargá la página."
                  : "Escribí y marcá todas las que quieras…"
            }
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

        {preview || comboHint || exclusionHint ? (
          <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs leading-5 text-muted-foreground sm:col-span-2">
            {preview}
            {comboHint}
            {exclusionHint}
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

      {notice ? (
        <PriceReviewNotice
          notice={notice}
          onDone={() => {
            setNotice(null);
            if (editing) onSaved?.();
          }}
        />
      ) : null}

      <p className="text-xs text-muted-foreground">
        Al guardar no cambia ningún precio todavía: se calcula qué productos se moverían y queda en Precios › Revisión de cambios para aplicarlo.
      </p>

      <div className="flex items-center justify-between gap-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : <span />}
        <div className="flex items-center gap-2">
          {editing && onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={openPreview} disabled={pending}>
            <Eye className="h-4 w-4" />
            Previsualizar
            {target !== "PRODUCT" && excludedIds.length > 0 ? ` (${excludedIds.length} excepto)` : ""}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editingGroup
              ? "Calcular impacto del grupo"
              : editing
                ? "Calcular impacto del cambio"
                : comboCount > 1
                  ? `Calcular impacto (${comboCount} subreglas)`
                  : "Calcular impacto"}
          </Button>
        </div>
      </div>
    </form>

      <RulePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        target={target}
        scopeIds={target === "ALL" ? [] : scopeIds}
        productMode={target === "PRODUCT"}
        includedProductIds={scopeIds}
        excludedIds={excludedIds}
        onToggle={togglePreviewProduct}
        onRestore={restorePreviewProduct}
      />
    </>
  );
}
