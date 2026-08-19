"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";
import { searchRulePreviewProducts, type RulePreviewProduct } from "@/server/actions/pricing-rules";
import type { RuleTarget } from "@/lib/pricing-scope";

export function RulePreviewModal({
  open,
  onClose,
  target,
  scopeIds,
  productMode,
  includedProductIds,
  excludedIds,
  onToggle,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  target: RuleTarget;
  scopeIds: string[];
  productMode: boolean;
  includedProductIds: string[];
  excludedIds: string[];
  onToggle: (productId: string, included: boolean) => void;
  onRestore: (productId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<RulePreviewProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [known, setKnown] = useState<Record<string, RulePreviewProduct>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
      return;
    }
    const t = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchRulePreviewProducts({
      q: debounced,
      target,
      scopeIds,
      hydrateIds: productMode ? [] : excludedIds,
      take: 200,
    })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error || "No se pudieron cargar los productos.");
          setItems([]);
          setTotal(0);
          return;
        }
        setItems(result.items);
        setTotal(result.total);
        setKnown((prev) => {
          const next = { ...prev };
          for (const item of [...result.items, ...result.hydrated]) next[item.id] = item;
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setError("No se pudieron cargar los productos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // excludedIds se manda para hidratar nombres; no refetch en cada destilde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debounced, target, scopeIds, productMode]);

  const excepted = productMode
    ? []
    : excludedIds.map((id) => known[id] || { id, name: "Producto", sku: null, brandName: null });

  function isIncluded(id: string) {
    return productMode ? includedProductIds.includes(id) : !excludedIds.includes(id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Previsualizar productos de la regla"
      description={
        productMode
          ? "Todos los tildados entran. Destildá uno para sacarlo de esta regla."
          : "Todos los tildados entran en la regla. Destildá los que quieras exceptuar: se guarda una subregla para esos productos y no les aplica este valor."
      }
      footer={
        <>
          <p className="mr-auto text-xs text-muted-foreground">
            {productMode
              ? `${includedProductIds.length} producto${includedProductIds.length === 1 ? "" : "s"} en la regla.`
              : `${excludedIds.length} exceptuado${excludedIds.length === 1 ? "" : "s"}. El resto entra.`}
          </p>
          <Button type="button" onClick={onClose}>
            Listo
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o SKU…"
            className="pl-9"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
        </div>

        {excepted.length > 0 ? (
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="mb-2 text-xs font-medium text-foreground">
              Exceptuados de esta regla ({excepted.length})
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {excepted.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onRestore(item.id)}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:border-primary hover:text-primary"
                    title="Volver a incluir"
                  >
                    {item.name}
                    <span className="ml-1 text-muted-foreground">×</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {loading
              ? "Buscando…"
              : total > items.length
                ? `Mostrando ${items.length} de ${total.toLocaleString("es-AR")}`
                : `${total.toLocaleString("es-AR")} producto${total === 1 ? "" : "s"}`}
          </span>
          {debounced ? <span>Filtro: “{debounced}”</span> : null}
        </div>

        <div className="max-h-[48vh] overflow-y-auto rounded-md border border-border">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando productos…
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {target !== "ALL" && scopeIds.length === 0
                ? "Elegí una marca, familia o recurso para ver productos."
                : "No hay productos para este alcance."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const included = isIncluded(item.id);
                return (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-secondary/50">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={included}
                        onChange={(e) => onToggle(item.id, e.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug">{item.name}</span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {[item.sku, item.brandName].filter(Boolean).join(" · ") || "Sin SKU"}
                          {!included ? " · no aplica esta regla" : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
