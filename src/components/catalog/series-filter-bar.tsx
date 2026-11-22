import Link from "next/link";
import type { FacetOption } from "@/lib/catalog";
import { shouldShowSeriesFilter } from "@/lib/product-lines/series-filter";
import { cn } from "@/lib/utils";

type RawParams = Record<string, string | string[] | undefined>;

function hrefFor(basePath: string, params: RawParams, lineId: string | null): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "line" || key === "page" || key === "family" || value == null) continue;
    if (Array.isArray(value)) for (const v of value) next.append(key, v);
    else next.set(key, value);
  }
  if (lineId) next.set("line", lineId);
  return `${basePath}?${next.toString()}`;
}

/**
 * Filtro «Serie» dentro de la página de una marca: aparece solo si la marca
 * tiene 2 o más series con productos. Los nombres son de la marca (no se traducen).
 */
export function SeriesFilterBar({
  series,
  brandIds,
  activeIds,
  params,
  basePath,
}: {
  series: FacetOption[];
  brandIds: string[] | undefined;
  activeIds: string[] | undefined;
  params: RawParams;
  basePath: string;
}) {
  if (!shouldShowSeriesFilter(brandIds, series.length)) return null;
  const active = new Set(activeIds ?? []);
  const pill = (on: boolean) =>
    cn(
      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary"
    );
  return (
    <nav aria-label="Series de la marca" className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Serie</span>
      <Link href={hrefFor(basePath, params, null)} className={pill(active.size === 0)} aria-current={active.size === 0 ? "true" : undefined}>
        Todas
      </Link>
      {series.map((s) => {
        const on = active.has(s.id);
        return (
          <Link key={s.id} href={hrefFor(basePath, params, on ? null : s.id)} className={pill(on)} aria-current={on ? "true" : undefined}>
            {s.name}
            <span className={on ? "text-primary-foreground/80" : "text-muted-foreground"}>{s.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}
