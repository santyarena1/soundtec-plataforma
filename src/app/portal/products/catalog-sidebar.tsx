"use client";

import { formatUsd } from "@/lib/utils";
import type { CatalogSidebarMeta } from "@/lib/catalog";
import type { CatalogUrlState } from "@/lib/catalog-url";
import { useCatalogNavigation } from "./use-catalog-navigation";
import { Sparkles, X } from "lucide-react";
import { SHOW_STOCK_TO_CUSTOMERS } from "@/lib/stock-display";

export function CatalogLayout({
  state,
  meta,
  total,
  children,
  toolbar,
  publicMode = false,
}: {
  state: CatalogUrlState;
  meta: CatalogSidebarMeta;
  total: number;
  children: React.ReactNode;
  toolbar: React.ReactNode;
  publicMode?: boolean;
}) {
  // La marca se elige en la barra de marcas de arriba (mobile y PC): sin sidebar.
  return (
    <div className="min-w-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          <Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent" />
          {total} resultado{total === 1 ? "" : "s"}
        </p>
        {toolbar}
        <CatalogActiveFilters state={state} meta={meta} publicMode={publicMode} />
        {children}
    </div>
  );
}

function CatalogActiveFilters({
  state,
  meta,
  publicMode,
}: {
  state: CatalogUrlState;
  meta: CatalogSidebarMeta;
  publicMode: boolean;
}) {
  const { push } = useCatalogNavigation();
  const chips: { key: string; label: string; clear: () => void }[] = [];

  if (state.search?.trim()) chips.push({ key: "q", label: `«${state.search}»`, clear: () => push({ search: "" }) });
  if (!publicMode && (state.minPrice != null || state.maxPrice != null)) {
    const label =
      state.minPrice != null && state.maxPrice != null
        ? `${formatUsd(state.minPrice)} – ${formatUsd(state.maxPrice)}`
        : state.maxPrice != null
          ? `Hasta ${formatUsd(state.maxPrice)}`
          : `Desde ${formatUsd(state.minPrice!)}`;
    chips.push({ key: "price", label, clear: () => push({ minPrice: undefined, maxPrice: undefined }) });
  }
  for (const id of state.brandIds || []) {
    const name = meta.brands.find((b) => b.id === id)?.name || "Marca";
    chips.push({ key: `brand-${id}`, label: name, clear: () => push({ brandIds: (state.brandIds || []).filter((x) => x !== id) }) });
  }
  for (const id of state.categoryIds || []) {
    const name = meta.categories.find((c) => c.id === id)?.name || "Categoría";
    chips.push({ key: `cat-${id}`, label: name, clear: () => push({ categoryIds: (state.categoryIds || []).filter((x) => x !== id) }) });
  }
  for (const id of state.familyIds || []) {
    const name = meta.families.find((f) => f.id === id)?.name || "Familia";
    chips.push({ key: `fam-${id}`, label: name, clear: () => push({ familyIds: (state.familyIds || []).filter((x) => x !== id) }) });
  }
  if (!publicMode && SHOW_STOCK_TO_CUSTOMERS && state.stock && state.stock !== "any") {
    const labels = { in_stock: "Solo en stock", low_stock: "Solo stock bajo", on_request: "Solo bajo pedido" };
    chips.push({ key: "stock", label: labels[state.stock], clear: () => push({ stock: "any" }) });
  }
  if (!publicMode && SHOW_STOCK_TO_CUSTOMERS && state.includeOutOfStock) {
    chips.push({ key: "oos", label: "Mostrando sin stock", clear: () => push({ includeOutOfStock: false }) });
  }
  if (state.hasDiscount) chips.push({ key: "disc", label: "Con descuento", clear: () => push({ hasDiscount: false }) });
  if (state.favoritesOnly) chips.push({ key: "fav", label: "Favoritos", clear: () => push({ favoritesOnly: false }) });
  if (state.crestronOnly) chips.push({ key: "crestron", label: "Crestron Home", clear: () => push({ crestronOnly: false }) });
  if (state.kind && state.kind !== "any") {
    chips.push({ key: "kind", label: state.kind === "PRINCIPAL" ? "Principales" : "Accesorios", clear: () => push({ kind: "any" }) });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.clear}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-xs font-medium hover:bg-secondary"
        >
          {c.label}
          <X className="h-3 w-3" />
        </button>
      ))}
      <button type="button" onClick={() => push({ reset: true })} className="text-xs text-accent hover:underline">
        Borrar todo
      </button>
    </div>
  );
}
