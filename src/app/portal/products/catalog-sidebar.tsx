"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import type { CatalogSidebarMeta } from "@/lib/catalog";
import type { CatalogUrlState } from "@/lib/catalog-url";
import { countActiveCatalogFilters } from "@/lib/catalog-url";
import { useCatalogNavigation } from "./use-catalog-navigation";
import {
  Check,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FACET_SEARCH_THRESHOLD = 10;
const FACET_MAX_VISIBLE = 7;

interface Props {
  state: CatalogUrlState;
  meta: CatalogSidebarMeta;
  /** Catálogo público: sin precios, stock ni favoritos. */
  publicMode?: boolean;
  className?: string;
  onCloseMobile?: () => void;
}

export function CatalogSidebar({ state, meta, publicMode = false, className, onCloseMobile }: Props) {
  const { push, toggleInList, isPending } = useCatalogNavigation();
  const activeCount = countActiveCatalogFilters(state);

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col rounded-xl border border-border bg-card shadow-sm lg:w-[280px]",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Filtros</h2>
          {activeCount > 0 ? <Badge tone="primary">{activeCount}</Badge> : null}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={() => push({ reset: true })}
              className="text-xs font-medium text-accent hover:underline"
            >
              Limpiar
            </button>
          ) : null}
          {onCloseMobile ? (
            <button type="button" onClick={onCloseMobile} className="rounded-md p-1 hover:bg-secondary lg:hidden" aria-label="Cerrar filtros">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Solo filtro por marca: categorías y familias todavía no están bien clasificadas. */}
      <div className={cn("flex-1 space-y-0.5 overflow-y-auto px-3 py-1", isPending && "pointer-events-none opacity-70")}>
        {meta.brands.length > 0 ? (
          <FilterSection title="Marca" defaultOpen activeCount={state.brandIds?.length}>
            <FacetList
              items={meta.brands}
              selected={state.brandIds || []}
              onToggle={(id) => toggleInList(state.brandIds, id, "brandIds")}
            />
          </FilterSection>
        ) : null}
      </div>
    </aside>
  );
}



function FilterSection({
  title,
  children,
  defaultOpen = false,
  activeCount = 0,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  activeCount?: number;
}) {
  const [open, setOpen] = useState(defaultOpen || activeCount > 0);
  return (
    <div className="border-b border-border/80 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-2.5 text-left text-sm font-semibold"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {title}
          {activeCount > 0 ? (
            <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
              {activeCount}
            </span>
          ) : null}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="pb-3">{children}</div> : null}
    </div>
  );
}

function OptionRow({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary",
        active && "bg-primary/10 font-medium text-primary"
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
            active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"
          )}
        >
          {active ? <Check className="h-3 w-3" /> : null}
        </span>
        {icon}
        <span className="truncate">{label}</span>
      </span>
      {count != null ? <span className="text-xs text-muted-foreground">{count}</span> : null}
    </button>
  );
}

function FacetList({
  items,
  selected,
  onToggle,
}: {
  items: { id: string; name: string; count: number }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    // Seleccionados primero, después por cantidad de productos.
    return [...list].sort((a, b) => {
      const sa = selected.includes(a.id) ? 1 : 0;
      const sb = selected.includes(b.id) ? 1 : 0;
      return sb - sa || b.count - a.count || a.name.localeCompare(b.name, "es");
    });
  }, [items, search, selected]);

  const visible = expanded || search.trim() ? filtered : filtered.slice(0, FACET_MAX_VISIBLE);

  return (
    <div className="space-y-2">
      {items.length > FACET_SEARCH_THRESHOLD ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar entre ${items.length}…`}
            className="h-8 pl-7 text-xs"
          />
        </div>
      ) : null}
      <ul className="space-y-0.5">
        {visible.map((item) => (
          <li key={item.id}>
            <OptionRow
              label={item.name}
              count={item.count}
              active={selected.includes(item.id)}
              onClick={() => onToggle(item.id)}
            />
          </li>
        ))}
        {filtered.length === 0 ? <p className="px-2 text-xs text-muted-foreground">Sin resultados</p> : null}
      </ul>
      {!search.trim() && filtered.length > FACET_MAX_VISIBLE ? (
        <button
          type="button"
          className="px-2 text-xs font-medium text-accent hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Ver menos" : `Ver ${filtered.length - FACET_MAX_VISIBLE} más`}
        </button>
      ) : null}
    </div>
  );
}

/** Drawer móvil + layout del catálogo */
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = countActiveCatalogFilters(state);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="hidden lg:block lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start">
        <CatalogSidebar state={state} meta={meta} publicMode={publicMode} className="lg:max-h-[calc(100vh-7rem)]" />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/40"
            aria-label="Cerrar filtros"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-hidden rounded-t-2xl bg-card shadow-2xl">
            <CatalogSidebar
              state={state}
              meta={meta}
              publicMode={publicMode}
              onCloseMobile={() => setMobileOpen(false)}
              className="max-h-[88vh]"
            />
          </div>
        </div>
      ) : null}

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeCount > 0 ? <Badge tone="primary">{activeCount}</Badge> : null}
          </Button>
          <p className="text-sm text-muted-foreground">
            <Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent" />
            {total} resultado{total === 1 ? "" : "s"}
          </p>
        </div>

        {toolbar}
        <CatalogActiveFilters state={state} meta={meta} publicMode={publicMode} />
        {children}
      </div>
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
  if (!publicMode && state.stock && state.stock !== "any") {
    const labels = { in_stock: "Solo en stock", low_stock: "Solo stock bajo", on_request: "Solo bajo pedido" };
    chips.push({ key: "stock", label: labels[state.stock], clear: () => push({ stock: "any" }) });
  }
  if (!publicMode && state.includeOutOfStock) {
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
