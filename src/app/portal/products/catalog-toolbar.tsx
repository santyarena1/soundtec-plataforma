"use client";

import { useEffect, useState } from "react";
import { Input, Select } from "@/components/ui/input";
import { LayoutGrid, Loader2, Search, Table2 } from "lucide-react";
import type { CatalogUrlState } from "@/lib/catalog-url";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCatalogNavigation } from "./use-catalog-navigation";

export function CatalogToolbar({ state }: { state: CatalogUrlState }) {
  const { push, isPending, params } = useCatalogNavigation();
  const [search, setSearch] = useState(state.search || "");
  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => {
    setSearch(state.search || "");
  }, [state.search]);

  useEffect(() => {
    const urlQ = (params.get("q") || "").trim();
    const nextQ = debouncedSearch.trim();
    if (nextQ === urlQ) return;
    push({ search: nextQ });
  }, [debouncedSearch, params, push]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en el catálogo..."
          className="h-11 pl-9 shadow-sm"
          aria-label="Buscar productos"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={state.sort || "name_asc"}
          onChange={(e) => push({ sort: e.target.value as CatalogUrlState["sort"] })}
          className="h-10 w-full min-w-[160px] text-sm sm:w-44"
        >
          <option value="name_asc">Nombre A-Z</option>
          <option value="name_desc">Nombre Z-A</option>
          <option value="price_asc">Menor precio</option>
          <option value="price_desc">Mayor precio</option>
          <option value="newest">Más nuevos</option>
        </Select>

        <div className="flex rounded-md border border-border bg-card p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => push({ view: "grid" })}
            className={`inline-flex h-9 items-center gap-1 rounded-sm px-3 text-xs font-medium ${
              state.view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <LayoutGrid className="h-4 w-4" /> Cuadrícula
          </button>
          <button
            type="button"
            onClick={() => push({ view: "table" })}
            className={`inline-flex h-9 items-center gap-1 rounded-sm px-3 text-xs font-medium ${
              state.view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Table2 className="h-4 w-4" /> Lista
          </button>
        </div>

        {isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>
    </div>
  );
}
