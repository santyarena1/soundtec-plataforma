"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { CatalogSidebarMeta } from "@/lib/catalog";
import type { CatalogUrlState } from "@/lib/catalog-url";
import { countActiveCatalogFilters } from "@/lib/catalog-url";
import { useCatalogNavigation } from "./use-catalog-navigation";
import {
  ChevronDown,
  FolderTree,
  Heart,
  Home,
  Layers,
  Percent,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRICE_PRESETS: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: "Cualquier precio", min: null, max: null },
  { label: "Hasta US$ 100", min: null, max: 100 },
  { label: "US$ 100 – 500", min: 100, max: 500 },
  { label: "US$ 500 – 2.000", min: 500, max: 2000 },
  { label: "Más de US$ 2.000", min: 2000, max: null },
];

interface Props {
  state: CatalogUrlState;
  meta: CatalogSidebarMeta;
  className?: string;
  onCloseMobile?: () => void;
}

export function CatalogSidebar({ state, meta, className, onCloseMobile }: Props) {
  const { push, toggleInList, isPending } = useCatalogNavigation();
  const activeCount = countActiveCatalogFilters(state);

  const [minInput, setMinInput] = useState(state.minPrice != null ? String(state.minPrice) : "");
  const [maxInput, setMaxInput] = useState(state.maxPrice != null ? String(state.maxPrice) : "");
  const debouncedMin = useDebouncedValue(minInput, 400);
  const debouncedMax = useDebouncedValue(maxInput, 400);

  useEffect(() => {
    setMinInput(state.minPrice != null ? String(state.minPrice) : "");
    setMaxInput(state.maxPrice != null ? String(state.maxPrice) : "");
  }, [state.minPrice, state.maxPrice]);

  useEffect(() => {
    const min = debouncedMin.trim() ? Number(debouncedMin) : undefined;
    const max = debouncedMax.trim() ? Number(debouncedMax) : undefined;
    const minOk = min === undefined || (Number.isFinite(min) && min >= 0);
    const maxOk = max === undefined || (Number.isFinite(max) && max >= 0);
    if (!minOk || !maxOk) return;
    if (min === state.minPrice && max === state.maxPrice) return;
    push({ minPrice: min, maxPrice: max });
  }, [debouncedMin, debouncedMax, push, state.minPrice, state.maxPrice]);

  const activePreset = useMemo(() => {
    return PRICE_PRESETS.findIndex(
      (p) => p.min === (state.minPrice ?? null) && p.max === (state.maxPrice ?? null)
    );
  }, [state.minPrice, state.maxPrice]);

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
        {onCloseMobile ? (
          <button type="button" onClick={onCloseMobile} className="rounded-md p-1 hover:bg-secondary lg:hidden">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className={cn("flex-1 space-y-1 overflow-y-auto p-3", isPending && "opacity-70 pointer-events-none")}>
        {meta.categories.length > 0 ? (
          <FilterSection title="Categoría" defaultOpen icon={<Layers className="h-3.5 w-3.5" />}>
            <FacetList
              items={meta.categories}
              selected={state.categoryIds || []}
              onToggle={(id) => toggleInList(state.categoryIds, id, "categoryIds")}
            />
          </FilterSection>
        ) : null}

        {meta.families.length > 0 ? (
          <FilterSection title="Familia" defaultOpen icon={<FolderTree className="h-3.5 w-3.5" />}>
            <FacetList
              items={meta.families}
              selected={state.familyIds || []}
              onToggle={(id) => toggleInList(state.familyIds, id, "familyIds")}
            />
          </FilterSection>
        ) : null}

        {meta.brands.length > 0 ? (
          <FilterSection
            title="Marca"
            defaultOpen={Boolean(state.brandIds?.length)}
          >
            <FacetList
              items={meta.brands}
              selected={state.brandIds || []}
              onToggle={(id) => toggleInList(state.brandIds, id, "brandIds")}
            />
          </FilterSection>
        ) : null}

        <FilterSection title="Tipo de producto" icon={<Tag className="h-3.5 w-3.5" />}>
          <StockOption
            label="Equipos principales"
            active={state.kind === "PRINCIPAL"}
            onClick={() => push({ kind: state.kind === "PRINCIPAL" ? "any" : "PRINCIPAL" })}
          />
          <StockOption
            label="Accesorios"
            active={state.kind === "ACCESORIO"}
            onClick={() => push({ kind: state.kind === "ACCESORIO" ? "any" : "ACCESORIO" })}
          />
        </FilterSection>

        <FilterSection title="Ofertas y guardados" icon={<Percent className="h-3.5 w-3.5" />}>
          <StockOption
            label="Con descuento"
            count={meta.discountCount}
            active={!!state.hasDiscount}
            onClick={() => push({ hasDiscount: !state.hasDiscount })}
          />
          <StockOption
            label="Mis favoritos"
            active={!!state.favoritesOnly}
            onClick={() => push({ favoritesOnly: !state.favoritesOnly })}
            icon={<Heart className="h-3.5 w-3.5 text-accent" />}
          />
          <StockOption
            label="Crestron Home"
            active={!!state.crestronOnly}
            onClick={() => push({ crestronOnly: !state.crestronOnly })}
            icon={<Home className="h-3.5 w-3.5 text-primary" />}
          />
        </FilterSection>

        <FilterSection
          title="Precio"
          defaultOpen={state.minPrice != null || state.maxPrice != null}
        >
          <p className="mb-2 text-[11px] text-muted-foreground">
            Rango en tu lista: {formatUsd(meta.priceBounds.min)} – {formatUsd(meta.priceBounds.max)}
          </p>
          <ul className="space-y-0.5">
            {PRICE_PRESETS.map((preset, i) => (
              <li key={preset.label}>
                <button
                  type="button"
                  onClick={() => {
                    setMinInput(preset.min != null ? String(preset.min) : "");
                    setMaxInput(preset.max != null ? String(preset.max) : "");
                    push({ minPrice: preset.min ?? undefined, maxPrice: preset.max ?? undefined });
                  }}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary",
                    activePreset === i && "bg-primary/10 font-medium text-primary"
                  )}
                >
                  {preset.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Mínimo</span>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
                className="h-8 text-xs"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Máximo</span>
              <Input
                type="number"
                min={0}
                placeholder={meta.priceBounds.max > 0 ? String(meta.priceBounds.max) : "—"}
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                className="h-8 text-xs"
              />
            </label>
          </div>
        </FilterSection>

        <FilterSection
          title="Disponibilidad"
          defaultOpen={Boolean(state.stock && state.stock !== "any")}
        >
          <StockOption
            label="En stock"
            count={meta.stockCounts.in_stock}
            active={state.stock === "in_stock"}
            onClick={() => push({ stock: state.stock === "in_stock" ? "any" : "in_stock" })}
          />
          <StockOption
            label="Stock bajo"
            count={meta.stockCounts.low_stock}
            active={state.stock === "low_stock"}
            onClick={() => push({ stock: state.stock === "low_stock" ? "any" : "low_stock" })}
          />
          <StockOption
            label="Bajo pedido"
            count={meta.stockCounts.on_request}
            active={state.stock === "on_request"}
            onClick={() => push({ stock: state.stock === "on_request" ? "any" : "on_request" })}
          />
        </FilterSection>
      </div>

      <div className="border-t border-border p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={activeCount === 0}
          onClick={() => push({ reset: true })}
        >
          Limpiar todos los filtros
        </Button>
      </div>
    </aside>
  );
}

function FilterSection({
  title,
  children,
  defaultOpen = false,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/80 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-2.5 text-left text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="pb-3">{children}</div> : null}
    </div>
  );
}

function StockOption({
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
      className={cn(
        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary",
        active && "bg-primary/10 font-medium text-primary"
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      {count != null ? <span className="text-xs text-muted-foreground">({count})</span> : null}
    </button>
  );
}

function FacetList({
  items,
  selected,
  onToggle,
  maxVisible = 8,
}: {
  items: { id: string; name: string; count: number }[];
  selected: string[];
  onToggle: (id: string) => void;
  maxVisible?: number;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const visible = expanded ? filtered : filtered.slice(0, maxVisible);

  return (
    <div className="space-y-2">
      {items.length > 6 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="h-8 pl-7 text-xs"
          />
        </div>
      ) : null}
      <ul className="space-y-0.5">
        {visible.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary">
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => onToggle(item.id)}
                className="rounded border-input text-primary focus:ring-accent"
              />
              <span className="flex-1 truncate">{item.name}</span>
              <span className="text-xs text-muted-foreground">({item.count})</span>
            </label>
          </li>
        ))}
        {filtered.length === 0 ? <p className="px-2 text-xs text-muted-foreground">Sin resultados</p> : null}
      </ul>
      {filtered.length > maxVisible ? (
        <button
          type="button"
          className="text-xs font-medium text-accent hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Ver menos" : `Ver más (${filtered.length - maxVisible})`}
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
}: {
  state: CatalogUrlState;
  meta: CatalogSidebarMeta;
  total: number;
  children: React.ReactNode;
  toolbar: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = countActiveCatalogFilters(state);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
        <CatalogSidebar state={state} meta={meta} />
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
            <CatalogSidebar state={state} meta={meta} onCloseMobile={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
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
        <CatalogActiveFilters state={state} meta={meta} />
        {children}
      </div>
    </div>
  );
}

function CatalogActiveFilters({ state, meta }: { state: CatalogUrlState; meta: CatalogSidebarMeta }) {
  const { push } = useCatalogNavigation();
  const chips: { key: string; label: string; clear: () => void }[] = [];

  if (state.search?.trim()) chips.push({ key: "q", label: `«${state.search}»`, clear: () => push({ search: "" }) });
  if (state.minPrice != null || state.maxPrice != null) {
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
    chips.push({
      key: `brand-${id}`,
      label: name,
      clear: () => push({ brandIds: (state.brandIds || []).filter((x) => x !== id) }),
    });
  }
  for (const id of state.categoryIds || []) {
    const name = meta.categories.find((c) => c.id === id)?.name || "Categoría";
    chips.push({
      key: `cat-${id}`,
      label: name,
      clear: () => push({ categoryIds: (state.categoryIds || []).filter((x) => x !== id) }),
    });
  }
  for (const id of state.familyIds || []) {
    const name = meta.families.find((f) => f.id === id)?.name || "Familia";
    chips.push({
      key: `fam-${id}`,
      label: name,
      clear: () => push({ familyIds: (state.familyIds || []).filter((x) => x !== id) }),
    });
  }
  if (state.stock && state.stock !== "any") {
    const labels = { in_stock: "En stock", low_stock: "Stock bajo", on_request: "Bajo pedido" };
    chips.push({
      key: "stock",
      label: labels[state.stock],
      clear: () => push({ stock: "any" }),
    });
  }
  if (state.hasDiscount) chips.push({ key: "disc", label: "Con descuento", clear: () => push({ hasDiscount: false }) });
  if (state.favoritesOnly) chips.push({ key: "fav", label: "Favoritos", clear: () => push({ favoritesOnly: false }) });
  if (state.crestronOnly) chips.push({ key: "crestron", label: "Crestron Home", clear: () => push({ crestronOnly: false }) });
  if (state.kind && state.kind !== "any") {
    chips.push({
      key: "kind",
      label: state.kind === "PRINCIPAL" ? "Principales" : "Accesorios",
      clear: () => push({ kind: "any" }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
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
