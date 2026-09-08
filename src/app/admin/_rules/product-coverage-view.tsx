"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { listProductRuleCoverage, type ProductCoverageResult, type ProductCoverageRow } from "@/server/actions/pricing-coverage";
import { CoverageFilters, type CoverageFiltersState } from "./coverage-filters";
import { CoverageTable } from "./coverage-table";
import { CoverageProductModal } from "./coverage-product-modal";

type Named = { id: string; name: string };
type Props = { kind: "margin" | "discount"; clients: Named[]; brands: Named[]; distributors: Named[]; categories: Named[]; families: Named[]; products: { id: string; normalizedName: string }[] };
function fromUrl(): { filters: CoverageFiltersState; page: number; pageSize: number } {
  const p = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const many = (key: string) => (p.get(key) || "").split(",").filter(Boolean);
  return { filters: { q: p.get("q") || "", brandIds: many("brand"), categoryIds: many("category"), familyIds: many("family"), distributorIds: many("distributor"), clientId: p.get("client") || "", coverage: p.get("coverage") === "with_rule" ? "with_rule" : p.get("coverage") === "without_rule" ? "without_rule" : "all" }, page: Math.max(1, Number(p.get("page")) || 1), pageSize: [25,50,100].includes(Number(p.get("pageSize"))) ? Number(p.get("pageSize")) : 25 };
}
export function ProductCoverageView(props: Props) {
  const initial = useRef(fromUrl()).current; const [filters, setFilters] = useState(initial.filters); const [debouncedQ, setDebouncedQ] = useState(filters.q);
  const [page, setPage] = useState(initial.page); const [pageSize, setPageSize] = useState(initial.pageSize); const [result, setResult] = useState<ProductCoverageResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]); const [openRow, setOpenRow] = useState<ProductCoverageRow | null>(null); const [bulk, setBulk] = useState(false); const [pending, start] = useTransition(); const request = useRef(0);
  useEffect(() => { const timer = setTimeout(() => { setDebouncedQ(filters.q); setPage(1); }, 300); return () => clearTimeout(timer); }, [filters.q]);
  const load = useCallback(() => { const id = ++request.current; start(async () => { const next = await listProductRuleCoverage({ kind: props.kind, ...filters, q: debouncedQ, clientId: filters.clientId || null, page, pageSize }); if (id === request.current) setResult(next); });
    const params = new URLSearchParams(window.location.search); params.set("view", "products"); const put = (k: string, v: string) => v ? params.set(k,v) : params.delete(k); put("q",debouncedQ); put("brand",filters.brandIds.join(",")); put("category",filters.categoryIds.join(",")); put("family",filters.familyIds.join(",")); put("distributor",filters.distributorIds.join(",")); put("client",filters.clientId); put("coverage",filters.coverage === "all" ? "" : filters.coverage); put("page",String(page)); put("pageSize",String(pageSize)); window.history.replaceState(null,"",`${window.location.pathname}?${params}`);
  }, [props.kind, filters, debouncedQ, page, pageSize]);
  useEffect(() => { load(); }, [load]);
  const ok = result?.ok ? result : null; const modalOptions = { clients: props.clients, brands: props.brands, distributors: props.distributors, categories: props.categories, families: props.families, products: props.products };
  function changeFilters(next: CoverageFiltersState) { setFilters(next); setPage(1); setSelected([]); }
  function changed() { setBulk(false); setOpenRow(null); setSelected([]); load(); }
  const bulkRow = ok?.items.find((row) => selected.includes(row.id)) || null;
  return <div className="space-y-4">
    <CoverageFilters value={filters} onChange={changeFilters} counts={{ total: ok?.total || 0, withRule: ok?.withRule || 0, withoutRule: ok?.withoutRule || 0 }} clients={props.clients} brands={props.brands} categories={props.categories} families={props.families} distributors={props.distributors} />
    {pending && !result ? <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Cargando productos…</div> : result && !result.ok ? <p className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{result.error}</p> : ok ? <CoverageTable kind={props.kind} rows={ok.items} selected={selected} onSelected={setSelected} onOpen={setOpenRow} page={page} pageSize={pageSize} total={ok.total} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} onApply={() => setBulk(true)} /> : null}
    <CoverageProductModal open={Boolean(openRow)} onClose={() => setOpenRow(null)} row={openRow} kind={props.kind} clientId={filters.clientId} options={modalOptions} onChanged={changed} />
    <CoverageProductModal open={bulk && Boolean(bulkRow)} onClose={() => setBulk(false)} row={bulkRow} kind={props.kind} clientId={filters.clientId} options={modalOptions} initialProductIds={selected} onChanged={changed} />
  </div>;
}