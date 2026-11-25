"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { listProductRuleCoverage, type ProductCoverageResult, type ProductCoverageRow } from "@/server/actions/pricing-coverage";
import { CoverageFilters, type CoverageFiltersState } from "./coverage-filters";
import { CoverageTable } from "./coverage-table";
import { CoverageProductModal } from "./coverage-product-modal";
import { useRuleCategories } from "./use-rule-products";

type Named = { id: string; name: string };
type CategoryNode = import("@/lib/category-tree").CategoryNode;
type Props = {
  kind: "margin" | "discount";
  clients: Named[];
  brands: Named[];
  distributors: Named[];
  categories: CategoryNode[];
  families: Named[];
  products: { id: string; normalizedName: string }[];
};

const PAGE_SIZES = [25, 50, 100];
const SEARCH_DEBOUNCE_MS = 300;

function fromUrl(): { filters: CoverageFiltersState; page: number; pageSize: number } {
  const p = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const many = (key: string) => (p.get(key) || "").split(",").filter(Boolean);
  const coverage = p.get("coverage");
  const pageSize = Number(p.get("pageSize"));
  return {
    filters: {
      q: p.get("q") || "",
      brandIds: many("brand"),
      categoryIds: many("category"),
      familyIds: many("family"),
      distributorIds: many("distributor"),
      clientId: p.get("client") || "",
      coverage: coverage === "with_rule" || coverage === "without_rule" ? coverage : "all",
    },
    page: Math.max(1, Number(p.get("page")) || 1),
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : 25,
  };
}

/** Deja los filtros en la URL (sin recargar) para poder volver o compartir la vista. */
function writeUrl(filters: Omit<CoverageFiltersState, "q">, q: string, page: number, pageSize: number) {
  const params = new URLSearchParams(window.location.search);
  const put = (k: string, v: string) => (v ? params.set(k, v) : params.delete(k));
  params.set("view", "products");
  put("q", q);
  put("brand", filters.brandIds.join(","));
  put("category", filters.categoryIds.join(","));
  put("family", filters.familyIds.join(","));
  put("distributor", filters.distributorIds.join(","));
  put("client", filters.clientId);
  put("coverage", filters.coverage === "all" ? "" : filters.coverage);
  put("page", page > 1 ? String(page) : "");
  put("pageSize", pageSize !== 25 ? String(pageSize) : "");
  window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
}

export function ProductCoverageView(props: Props) {
  const initial = useRef(fromUrl()).current;
  const [filters, setFilters] = useState(initial.filters);
  const [debouncedQ, setDebouncedQ] = useState(initial.filters.q);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [result, setResult] = useState<ProductCoverageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [openRow, setOpenRow] = useState<ProductCoverageRow | null>(null);
  const [bulk, setBulk] = useState(false);
  const request = useRef(0);
  const { categories } = useRuleCategories(true, props.categories);
  // Filas ya vistas: la selección se mantiene al pasar de página y el modal «Aplicar a los N» necesita una.
  const seenRows = useRef(new Map<string, ProductCoverageRow>());

  // La búsqueda espera a que dejes de escribir: antes cada tecla recalculaba los precios de todo el catálogo.
  useEffect(() => {
    if (filters.q === debouncedQ) return;
    const timer = setTimeout(() => {
      setDebouncedQ(filters.q);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.q, debouncedQ]);

  const { brandIds, categoryIds, familyIds, distributorIds, clientId, coverage } = filters;
  const query = useMemo(
    () => ({ brandIds, categoryIds, familyIds, distributorIds, clientId, coverage }),
    [brandIds, categoryIds, familyIds, distributorIds, clientId, coverage]
  );

  const load = useCallback(async () => {
    const id = ++request.current;
    writeUrl(query, debouncedQ, page, pageSize);
    setLoading(true);
    try {
      const next = await listProductRuleCoverage({ kind: props.kind, ...query, q: debouncedQ, clientId: query.clientId || null, page, pageSize });
      if (id === request.current) setResult(next);
    } catch {
      if (id === request.current) setResult({ ok: false, error: "No se pudo cargar la cobertura. Probá de nuevo." });
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [props.kind, query, debouncedQ, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const ok = result?.ok ? result : null;
  if (ok) for (const row of ok.items) seenRows.current.set(row.id, row);
  const modalOptions = {
    clients: props.clients,
    brands: props.brands,
    distributors: props.distributors,
    categories,
    families: props.families,
    products: props.products,
  };
  function changeFilters(next: CoverageFiltersState) {
    setFilters(next);
    // Solo la búsqueda espera; el resto vuelve a la primera página en el momento.
    if (next.q === filters.q) setPage(1);
    setSelected([]);
  }
  function changed() {
    setBulk(false);
    setOpenRow(null);
    setSelected([]);
    void load();
  }
  const bulkRow =
    ok?.items.find((row) => selected.includes(row.id)) ||
    selected.map((id) => seenRows.current.get(id)).find((row): row is ProductCoverageRow => Boolean(row)) ||
    null;
  return (
    <div className="space-y-4">
      <CoverageFilters
        value={filters}
        onChange={changeFilters}
        counts={{ total: ok?.total || 0, withRule: ok?.withRule || 0, withoutRule: ok?.withoutRule || 0 }}
        clients={props.clients}
        brands={props.brands}
        categories={categories}
        families={props.families}
        distributors={props.distributors}
      />
      {loading && !result ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Cargando productos…
        </div>
      ) : result && !result.ok ? (
        <p className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{result.error}</p>
      ) : ok ? (
        <div className={loading ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
          <CoverageTable
            kind={props.kind}
            rows={ok.items}
            selected={selected}
            onSelected={setSelected}
            onOpen={setOpenRow}
            page={page}
            pageSize={pageSize}
            total={ok.total}
            onPage={setPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            onApply={() => setBulk(true)}
          />
        </div>
      ) : null}
      <CoverageProductModal open={Boolean(openRow)} onClose={() => setOpenRow(null)} row={openRow} kind={props.kind} clientId={filters.clientId} options={modalOptions} onChanged={changed} />
      <CoverageProductModal
        open={bulk && Boolean(bulkRow)}
        onClose={() => setBulk(false)}
        row={bulkRow}
        kind={props.kind}
        clientId={filters.clientId}
        options={modalOptions}
        initialProductIds={selected}
        onChanged={changed}
      />
    </div>
  );
}
