"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Select } from "@/components/ui/input";
import { LayoutGrid, Loader2, Search, Table2 } from "lucide-react";
import type { CatalogUrlState } from "@/lib/catalog-url";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCatalogNavigation } from "./use-catalog-navigation";

/**
 * Espera para buscar mientras se escribe. Con 350 ms la búsqueda salía a mitad
 * de un modelo largo («AT-HDVS-CAM-HD…») y la respuesta pisaba lo que se
 * seguía tipeando. Enter busca al instante.
 */
const SEARCH_DEBOUNCE_MS = 1200;

export function CatalogToolbar({ state, publicMode = false }: { state: CatalogUrlState; publicMode?: boolean }) {
  const { push, isPending, params } = useCatalogNavigation();
  const [search, setSearch] = useState(state.search || "");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const inputRef = useRef<HTMLInputElement>(null);
  // Lo último que se mandó a buscar: Enter y el fin de la espera no repiten la misma búsqueda.
  const lastSent = useRef((state.search || "").trim());
  void publicMode;

  // La URL cambió desde afuera (pastilla «×», «Borrar todo», atrás): se copia al
  // campo, salvo mientras se está escribiendo, para no pisar lo tipeado.
  useEffect(() => {
    lastSent.current = (state.search || "").trim();
    if (document.activeElement === inputRef.current) return;
    setSearch(state.search || "");
  }, [state.search]);

  function submit(value: string) {
    const urlQ = (params.get("q") || "").trim();
    const nextQ = value.trim();
    if (nextQ === urlQ || nextQ === lastSent.current) return;
    lastSent.current = nextQ;
    push({ search: nextQ });
  }

  useEffect(() => {
    submit(debouncedSearch);
    // Solo cuando termina la espera; `params` cambia con cada navegación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <form
        role="search"
        className="relative flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          submit(search);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por modelo, marca o palabra clave…"
          className="h-11 pl-9 shadow-sm"
          aria-label="Buscar productos"
          enterKeyHint="search"
          autoComplete="off"
        />
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={state.sort || "relevance"}
          onChange={(e) => push({ sort: e.target.value as CatalogUrlState["sort"] })}
          className="h-10 w-full min-w-[160px] text-sm sm:w-44"
          aria-label="Ordenar por"
        >
          <option value="relevance">Más relevantes</option>
          <option value="price_desc">Mayor precio</option>
          <option value="price_asc">Menor precio</option>
          <option value="name_asc">Nombre A-Z</option>
          <option value="name_desc">Nombre Z-A</option>
          <option value="newest">Más nuevos</option>
        </Select>

        <Select
          value={String(state.pageSize ?? 24)}
          onChange={(e) => push({ pageSize: Number(e.target.value) })}
          className="h-10 w-24 text-sm"
          aria-label="Productos por página"
        >
          <option value="12">12</option>
          <option value="24">24</option>
          <option value="48">48</option>
          <option value="60">60</option>
        </Select>

        <div className="flex rounded-md border border-border bg-card p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => push({ view: "grid" })}
            className={`inline-flex h-9 items-center gap-1 rounded-sm px-3 text-xs font-medium ${
              state.view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <LayoutGrid className="h-4 w-4" /> <span className="hidden sm:inline">Cuadrícula</span>
          </button>
          <button
            type="button"
            onClick={() => push({ view: "table" })}
            className={`inline-flex h-9 items-center gap-1 rounded-sm px-3 text-xs font-medium ${
              state.view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Table2 className="h-4 w-4" /> <span className="hidden sm:inline">Lista</span>
          </button>
        </div>

        {isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>
    </div>
  );
}
