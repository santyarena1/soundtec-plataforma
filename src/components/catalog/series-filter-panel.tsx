import Link from "next/link";
import { X } from "lucide-react";
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

export interface SeriesFilterPanelProps {
  series: FacetOption[];
  brandIds: string[] | undefined;
  crestronOnly?: boolean;
  activeIds: string[] | undefined;
  params: RawParams;
  basePath: string;
  /** sidebar: debajo de Rubros en la columna de PC; panel: dentro del desplegable de tablet y celular. */
  variant?: "sidebar" | "panel";
}

/** Si el filtro «Series» corresponde (marca o grupo de marcas con 2 o más series). */
export function hasSeriesFilter({ series, brandIds, crestronOnly }: Pick<SeriesFilterPanelProps, "series" | "brandIds" | "crestronOnly">): boolean {
  return shouldShowSeriesFilter({ brandIds, crestronOnly }, series.length);
}

/**
 * Filtro «Series» del fabricante, con el mismo estilo del panel de Rubros:
 * título, lista con cantidades, la elegida marcada y «Limpiar serie». Los
 * nombres son de la marca (no se traducen).
 */
export function SeriesFilterPanel({ series, brandIds, crestronOnly, activeIds, params, basePath, variant = "sidebar" }: SeriesFilterPanelProps) {
  if (!hasSeriesFilter({ series, brandIds, crestronOnly })) return null;
  const active = new Set(activeIds ?? []);
  const row = (on: boolean) =>
    cn(
      "relative flex items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-[13px] leading-snug outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
      on ? "bg-primary/[0.07] font-semibold text-primary" : "text-foreground hover:bg-secondary"
    );
  const bar = <span aria-hidden="true" className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" />;
  return (
    <nav
      aria-label="Series del fabricante"
      className={cn(
        "flex shrink-0 flex-col rounded-xl border border-border bg-card shadow-sm",
        variant === "sidebar" ? "max-h-[40dvh]" : "max-h-[50vh]"
      )}
    >
      <p className="border-b border-border px-3 py-2.5 text-sm font-semibold text-foreground">Series</p>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]">
        <li>
          <Link href={hrefFor(basePath, params, null)} aria-current={active.size === 0 ? "page" : undefined} className={cn(row(active.size === 0), active.size > 0 && "text-muted-foreground")}>
            {active.size === 0 ? bar : null}
            Todas las series
          </Link>
        </li>
        {series.map((s) => {
          const on = active.has(s.id);
          return (
            <li key={s.id} className="mt-px">
              <Link href={hrefFor(basePath, params, on ? null : s.id)} aria-current={on ? "page" : undefined} className={row(on)}>
                {on ? bar : null}
                <span className="min-w-0 flex-1 break-words">{s.name}</span>
                <span className={cn("shrink-0 text-[11px] tabular-nums", on ? "text-primary/80" : "text-muted-foreground")}>{s.count.toLocaleString("es-AR")}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {active.size > 0 ? (
        <div className="border-t border-border p-1.5">
          <Link
            href={hrefFor(basePath, params, null)}
            className="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Limpiar serie
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
