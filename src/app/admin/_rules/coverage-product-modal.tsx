"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { RulesForm } from "./rules-form";
import {
  removePricingRule,
  setPricingRuleActive,
  type ProductCoverageRow,
} from "@/server/actions/pricing-coverage";
import { describeRuleAppliesTo } from "@/lib/pricing-scope";
import type { PricingRuleRow } from "@/components/admin/pricing-rules-table";
import type { RuleTarget } from "@/lib/pricing-scope";

type Named = { id: string; name: string };
type Choice = { target: RuleTarget; id?: string; label: string; count?: number };
export function CoverageProductModal({
  open,
  onClose,
  row,
  kind,
  clientId,
  options,
  initialProductIds,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  row: ProductCoverageRow | null;
  kind: "margin" | "discount";
  clientId: string;
  options: {
    clients: Named[];
    brands: Named[];
    distributors: Named[];
    categories: Named[];
    families: Named[];
    products: { id: string; normalizedName: string }[];
  };
  initialProductIds?: string[];
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(Boolean(initialProductIds?.length));
  const [multi, setMulti] = useState(false);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [editing, setEditing] = useState<PricingRuleRow | null>(null);
  const [editingGroup, setEditingGroup] = useState(false);
  const [pending, start] = useTransition();
  const groupId = useMemo(
    () => `grp_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    [open],
  );
  useEffect(() => {
    if (!open) return;
    setCreating(Boolean(initialProductIds?.length));
    setChoices([]);
    setEditing(null);
    setEditingGroup(false);
    setSavedCount(0);
  }, [open, row?.id, initialProductIds?.length]);
  if (!row) return null;
  const noun = kind === "margin" ? "margen" : "descuento";
  const available: Choice[] = [
    { target: "PRODUCT", id: row.id, label: "Sólo este producto", count: 1 },
    ...(row.brandId
      ? [
          {
            target: "BRAND" as const,
            id: row.brandId,
            label: `Todos los de la marca «${row.brandName}»`,
            count: row.scopeCounts.brand,
          },
        ]
      : []),
    ...(row.categoryId
      ? [
          {
            target: "CATEGORY" as const,
            id: row.categoryId,
            label: `Toda la categoría «${row.categoryName}»`,
            count: row.scopeCounts.category,
          },
        ]
      : []),
    ...(row.familyId
      ? [
          {
            target: "FAMILY" as const,
            id: row.familyId,
            label: `Toda la familia «${row.familyName}»`,
            count: row.scopeCounts.family,
          },
        ]
      : []),
    ...(row.distributorId
      ? [
          {
            target: "DISTRIBUTOR" as const,
            id: row.distributorId,
            label: `Todo el proveedor «${row.distributorName}»`,
            count: row.scopeCounts.distributor,
          },
        ]
      : []),
    { target: "ALL", label: "Todo el catálogo", count: row.scopeCounts.catalog },
  ];
  const selected = initialProductIds?.length
    ? [
        {
          target: "PRODUCT" as const,
          label: `${initialProductIds.length} productos`,
          id: initialProductIds[0],
        },
      ]
    : choices;
  function choose(choice: Choice) {
    if (!multi) setCreating(true);
    setEditing(null);
    setChoices((prev) =>
      multi
        ? prev.some((x) => x.target === choice.target && x.id === choice.id)
          ? prev.filter((x) => x.target !== choice.target || x.id !== choice.id)
          : [...prev, choice]
        : [choice],
    );
  }
  function mutate(action: () => Promise<unknown>, message: string) {
    start(async () => {
      try {
        await action();
        toast.success(message);
        onChanged();
      } catch {
        toast.error("No se pudo actualizar la regla.");
      }
    });
  }
  const formOptions = { ...options, clients: options.clients };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row.name}
      size="xl"
      description={`${row.sku || "Sin SKU"} · ${[row.brandName, row.categoryName, row.familyName].filter(Boolean).join(" › ") || "Sin clasificación"}`}
    >
      <div className="space-y-5">
        <div className="flex gap-4 rounded-lg bg-secondary/40 p-3">
          {row.imageUrl ? (
            <img src={row.imageUrl} alt="" className="h-20 w-20 rounded bg-white object-contain" />
          ) : null}
          <div className="grid gap-1 text-sm sm:grid-cols-2 sm:gap-x-8">
            <span>
              Costo base: <b>USD {row.baseCostUsd.toLocaleString("es-AR")}</b>
            </span>
            <span>
              Precio actual:{" "}
              <b>USD {row.priceUsdFinal.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</b>
            </span>
            <span>
              {kind === "margin"
                ? `Markup ×${row.markupMultiplier.toLocaleString("es-AR")}`
                : `Descuento ${row.discountPercent.toLocaleString("es-AR")}%`}
            </span>
          </div>
        </div>
        {editing ? (
          <div>
            <h3 className="mb-3 font-semibold">
              {editingGroup ? "Editar grupo" : "Editar regla en profundidad"}
            </h3>
            <RulesForm
              type={kind}
              initial={
                editingGroup
                  ? {
                      ...editing,
                      members: row.candidateRules.filter((x) => x.groupId === editing.groupId),
                    }
                  : editing
              }
              editingGroup={editingGroup}
              {...formOptions}
              onSaved={() => {
                setEditing(null);
                onChanged();
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : creating && selected.length ? (
          <div className="space-y-5">
            <h3 className="font-semibold">Configurar {noun}</h3>
            {selected.map((choice, index) => (
              <div
                key={`${choice.target}-${choice.id || "all"}`}
                className={selected.length > 1 ? "rounded-lg border p-4" : ""}
              >
                {selected.length > 1 ? (
                  <p className="mb-3 text-sm font-medium">
                    {choice.label} ({index + 1} de {selected.length})
                  </p>
                ) : null}
                <RulesForm
                  type={kind}
                  {...formOptions}
                  presetClientId={clientId || null}
                  presetTarget={choice.target}
                  presetScopeIds={
                    initialProductIds?.length ? initialProductIds : choice.id ? [choice.id] : []
                  }
                  presetGroupId={selected.length > 1 ? groupId : undefined}
                  onSaved={() => {
                    if (selected.length === 1) onChanged();
                    else
                      setSavedCount((count) => {
                        const next = count + 1;
                        if (next >= selected.length) setTimeout(onChanged, 0);
                        return next;
                      });
                  }}
                />
              </div>
            ))}
          </div>
        ) : row.appliedRule || row.source === "PRODUCT_FIELD" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Reglas que alcanzan a este producto</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setChoices([{ target: "PRODUCT", id: row.id, label: "Sólo este producto" }]);
                  setCreating(true);
                }}
              >
                Agregar otra regla
              </Button>
            </div>
            {row.source === "PRODUCT_FIELD" ? (
              <div className="rounded-lg border p-3">
                <Badge tone="success">Aplicada</Badge>
                <p className="mt-2 text-sm">
                  Descuento del producto ({row.discountPercent}%). Se edita desde la ficha del
                  producto.
                </p>
              </div>
            ) : null}
            {row.candidateRules.map((rule, index) => (
              <div key={rule.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <b>{rule.name}</b>
                      {rule.id === row.appliedRule?.id ? (
                        <Badge tone="success">Aplicada</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {describeRuleAppliesTo(rule)}
                      {index === 0
                        ? " · Es la coincidencia más específica y gana sobre las siguientes."
                        : " · Queda detrás por precedencia."}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(rule);
                        setEditingGroup(false);
                      }}
                    >
                      Editar
                    </Button>
                    {rule.groupId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(rule);
                          setEditingGroup(true);
                        }}
                      >
                        Editar grupo
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        mutate(
                          () => setPricingRuleActive({ kind, id: rule.id, active: false }),
                          "Regla desactivada.",
                        )
                      }
                    >
                      Desactivar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={pending}
                      onClick={() =>
                        mutate(() => removePricingRule({ kind, id: rule.id }), "Regla quitada.")
                      }
                    >
                      Quitar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">
                Este producto no tiene {noun} propio. ¿A qué querés aplicarle uno?
              </h3>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={multi}
                  onChange={(e) => {
                    setMulti(e.target.checked);
                    setChoices([]);
                  }}
                />
                Aplicar a varios a la vez
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {available.map((choice) => {
                const active = choices.some(
                  (x) => x.target === choice.target && x.id === choice.id,
                );
                return (
                  <button
                    key={`${choice.target}-${choice.id || "all"}`}
                    type="button"
                    onClick={() => choose(choice)}
                    className={`rounded-lg border p-4 text-left hover:border-primary ${active ? "border-primary bg-primary/5" : ""}`}
                  >
                    <b className="block">{choice.label}</b>
                    <span className="text-xs text-muted-foreground">
                      {choice.count?.toLocaleString("es-AR")} producto
                      {choice.count === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
            </div>
            {multi && choices.length ? (
              <Button onClick={() => setCreating(true)}>
                Continuar con {choices.length} alcances
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() =>
                choose({ target: "PRODUCT", id: row.id, label: "Elegir otros productos" })
              }
            >
              Elegir otros productos…
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
