"use client";

import { formatUsd } from "@/lib/utils";
import type { CatalogSidebarMeta } from "@/lib/catalog";
import type { CatalogUrlState } from "@/lib/catalog-url";
import { useCatalogNavigation } from "./use-catalog-navigation";
import { X } from "lucide-react";
import { SHOW_STOCK_TO_CUSTOMERS } from "@/lib/stock-display";

export function CatalogLayout({
  state,
  meta,
  total,
  children,
  toolbar,
  publicMode = false,
  categoryShownAbove = false,
  lead,
  quickFilters,
}: {
  /** Botones de filtro rápido (una por etiqueta, descuento, favoritos), debajo del buscador. */
  quickFilters?: React.ReactNode;
  /** A la izquierda de la cantidad: el camino del rubro (y el botón «Rubros» sin sidebar). */
  lead?: React.ReactNode;
  state: CatalogUrlState;
  meta: CatalogSidebarMeta;
  total: number;
  children: React.ReactNode;
  toolbar: React.ReactNode;
  publicMode?: boolean;
  /** El rubro elegido ya se ve arriba (camino de rubros del portal): sin pastilla repetida. */
  categoryShownAbove?: boolean;
}) {
  // Orden: buscar y ordenar → dónde estoy (camino del rubro y filtros activos) y cuántos hay → resultados.
  return (
    <div className="min-w-0 space-y-4">
      {toolbar}
      {quickFilters}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 basis-full flex-wrap items-center gap-x-4 gap-y-2 empty:hidden sm:basis-0 sm:flex-1">
          {lead}
          <CatalogActiveFilters state={state} meta={meta} publicMode={publicMode} hideCategories={categoryShownAbove} />
        </div>
        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{total.toLocaleString("es-AR")}</span> producto{total === 1 ? "" : "s"}
        </p>
      </div>
      {children}
    </div>
  );
}

function CatalogActiveFilters({
  state,
  meta,
  publicMode,
  hideCategories,
}: {
  state: CatalogUrlState;
  meta: CatalogSidebarMeta;
  publicMode: boolean;
  hideCategories: boolean;
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
  // Una sola marca ya se ve marcada en la barra de marcas: sin pastilla repetida.
  for (const id of (state.brandIds?.length ?? 0) > 1 ? state.brandIds! : []) {
    const name = meta.brands.find((b) => b.id === id)?.name || "Marca";
    chips.push({ key: `brand-${id}`, label: name, clear: () => push({ brandIds: (state.brandIds || []).filter((x) => x !== id) }) });
  }
  for (const id of hideCategories ? [] : state.categoryIds || []) {
    const name = meta.categories.find((c) => c.id === id)?.name || "Categoría";
    chips.push({ key: `cat-${id}`, label: name, clear: () => push({ categoryIds: (state.categoryIds || []).filter((x) => x !== id) }) });
  }
  for (const id of state.lineIds || []) {
    const name = meta.series.find((s) => s.id === id)?.name;
    chips.push({ key: `line-${id}`, label: name ? `Serie ${name}` : "Serie", clear: () => push({ lineIds: (state.lineIds || []).filter((x) => x !== id) }) });
  }
  if (!publicMode && SHOW_STOCK_TO_CUSTOMERS && state.stock && state.stock !== "any") {
    const labels = { in_stock: "Solo en stock", low_stock: "Solo stock bajo", on_request: "Solo bajo pedido" };
    chips.push({ key: "stock", label: labels[state.stock], clear: () => push({ stock: "any" }) });
  }
  if (!publicMode && SHOW_STOCK_TO_CUSTOMERS && state.includeOutOfStock) {
    chips.push({ key: "oos", label: "Mostrando sin stock", clear: () => push({ includeOutOfStock: false }) });
  }
  // Descuento, favoritos y etiquetas se ven prendidos en sus botones (fila de arriba): sin pastilla repetida.
  const quickActive = !!state.hasDiscount || !!state.favoritesOnly || !!state.labelIds?.length || !!state.commercialTags?.length;
  if (state.crestronOnly) chips.push({ key: "crestron", label: "Crestron Home", clear: () => push({ crestronOnly: false }) });
  if (state.kind && state.kind !== "any") {
    chips.push({ key: "kind", label: state.kind === "PRINCIPAL" ? "Principales" : "Accesorios", clear: () => push({ kind: "any" }) });
  }

  if (chips.length === 0 && !quickActive) return null;

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
