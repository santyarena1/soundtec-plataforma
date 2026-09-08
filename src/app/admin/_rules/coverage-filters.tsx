"use client";

import { SearchablePick } from "@/components/admin/searchable-pick";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Named = { id: string; name: string };
export type CoverageFiltersState = { q: string; brandIds: string[]; categoryIds: string[]; familyIds: string[]; distributorIds: string[]; clientId: string; coverage: "all" | "with_rule" | "without_rule" };

export function CoverageFilters({ value, onChange, counts, clients, brands, categories, families, distributors }: {
  value: CoverageFiltersState; onChange: (next: CoverageFiltersState) => void;
  counts: { total: number; withRule: number; withoutRule: number };
  clients: Named[]; brands: Named[]; categories: Named[]; families: Named[]; distributors: Named[];
}) {
  const set = <K extends keyof CoverageFiltersState>(key: K, next: CoverageFiltersState[K]) => onChange({ ...value, [key]: next });
  const chips = [
    { id: "all" as const, label: "Todos", count: counts.withRule + counts.withoutRule, tone: "border-border" },
    { id: "with_rule" as const, label: "Con regla", count: counts.withRule, tone: "border-emerald-300 text-emerald-700" },
    { id: "without_rule" as const, label: "Sin regla", count: counts.withoutRule, tone: "border-amber-300 text-amber-700" },
  ];
  return <div className="space-y-4 rounded-lg border border-border bg-card p-4">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-1.5"><label className="text-sm font-medium">Buscar</label><Input value={value.q} onChange={(e) => set("q", e.target.value)} placeholder="Nombre, SKU, marca…" /></div>
      <SearchablePick label="Ver como" options={[{ id: "global", name: "Reglas globales" }, ...clients]} value={value.clientId || "global"} onChange={(id) => set("clientId", id === "global" ? "" : id)} placeholder="Buscá un cliente…" />
      <SearchablePick label="Marcas" options={brands} values={value.brandIds} onValuesChange={(x) => set("brandIds", x)} multiple />
      <SearchablePick label="Categorías" options={categories} values={value.categoryIds} onValuesChange={(x) => set("categoryIds", x)} multiple />
      <SearchablePick label="Familias" options={families} values={value.familyIds} onValuesChange={(x) => set("familyIds", x)} multiple />
      <SearchablePick label="Proveedores" options={distributors} values={value.distributorIds} onValuesChange={(x) => set("distributorIds", x)} multiple />
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Cobertura">{chips.map((chip) => <button key={chip.id} type="button" onClick={() => set("coverage", chip.id)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", chip.tone, value.coverage === chip.id && "bg-primary text-primary-foreground")}>{chip.label} ({chip.count.toLocaleString("es-AR")})</button>)}</div>
  </div>;
}