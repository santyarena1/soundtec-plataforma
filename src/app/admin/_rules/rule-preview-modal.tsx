"use client";

import { useEffect, useState } from "react";
import { ImageOff, LayoutGrid, List, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { searchRulePreviewProducts, type RulePreviewProduct } from "@/server/actions/pricing-rules";
import type { RuleTarget } from "@/lib/pricing-scope";

type PreviewView = "cards" | "list";
const VIEW_KEY = "rule-preview-view";

function ProductThumb({
  item,
  className,
  containClassName,
}: {
  item: RulePreviewProduct;
  className?: string;
  containClassName?: string;
}) {
  if (item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.imageUrl} alt={item.name} className={containClassName || "h-full w-full object-contain"} />
    );
  }
  return (
    <span className={cn("flex h-full w-full items-center justify-center text-muted-foreground", className)}>
      <ImageOff className="h-5 w-5" />
    </span>
  );
}

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
  const [view, setView] = useState<PreviewView>("cards");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);
      if (stored === "cards" || stored === "list") setView(stored);
    } catch {
      // ignore
    }
  }, []);

  function changeView(next: PreviewView) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // ignore
    }
  }

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
    : excludedIds.map(
        (id) => known[id] || { id, name: "Producto", sku: null, brandName: null, imageUrl: null }
      );

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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
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
          <div className="flex h-10 shrink-0 rounded-md border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => changeView("cards")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[5px] px-3 text-xs font-medium",
                view === "cards"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              Tarjetas
            </button>
            <button
              type="button"
              onClick={() => changeView("list")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[5px] px-3 text-xs font-medium",
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
              )}
            >
              <List className="h-4 w-4" />
              Lista
            </button>
          </div>
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
                    className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 text-xs hover:border-primary hover:text-primary"
                    title="Volver a incluir"
                  >
                    <span className="h-6 w-6 overflow-hidden rounded-full bg-white">
                      <ProductThumb item={item} containClassName="h-full w-full object-cover" />
                    </span>
                    <span className="max-w-[160px] truncate">{item.name}</span>
                    <span className="text-muted-foreground">×</span>
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

        <div className="max-h-[52vh] overflow-y-auto rounded-md border border-border p-2 sm:p-3">
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
          ) : view === "cards" ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => {
                const included = isIncluded(item.id);
                return (
                  <li key={item.id}>
                    <label
                      className={cn(
                        "flex h-full cursor-pointer flex-col overflow-hidden rounded-md border bg-card transition-colors",
                        included
                          ? "border-border hover:border-primary/50"
                          : "border-destructive/40 bg-secondary/40 opacity-70"
                      )}
                    >
                      <span className="relative aspect-[4/3] bg-white">
                        <ProductThumb item={item} />
                        <input
                          type="checkbox"
                          className="absolute left-2 top-2 h-4 w-4"
                          checked={included}
                          onChange={(e) => onToggle(item.id, e.target.checked)}
                        />
                        {!included ? (
                          <span className="absolute right-2 top-2 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
                            Exceptuado
                          </span>
                        ) : null}
                      </span>
                      <span className="flex flex-1 flex-col gap-0.5 p-2">
                        <span className="line-clamp-2 text-xs font-medium leading-snug">{item.name}</span>
                        <span className="line-clamp-1 text-[11px] text-muted-foreground">
                          {[item.sku, item.brandName].filter(Boolean).join(" · ") || "Sin SKU"}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {items.map((item) => {
                const included = isIncluded(item.id);
                return (
                  <li key={item.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-secondary/50",
                        included ? "" : "bg-secondary/40 opacity-70"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={included}
                        onChange={(e) => onToggle(item.id, e.target.checked)}
                      />
                      <span className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-white">
                        <ProductThumb item={item} />
                      </span>
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
