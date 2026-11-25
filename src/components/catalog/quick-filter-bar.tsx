import Link from "next/link";
import { Check, Heart, Tag } from "lucide-react";
import { buildQuickFilters, quickFilterHref, type QuickFilter, type QuickFilterCounts, type QuickFilterState } from "@/lib/catalog-quick-filters";
import { labelColors } from "@/lib/label-colors";
import { cn } from "@/lib/utils";

type RawParams = Record<string, string | string[] | undefined>;

/**
 * Fila de botones de filtro rápido: uno por etiqueta (Precio promocional,
 * Precio especial, Liquidación…), «Con descuento» y «Favoritos». Se tocan y
 * filtran al instante; se combinan con marca, rubro y búsqueda (quedan en la URL).
 * Si ninguno tiene productos visibles, no se muestra la fila.
 */
export function QuickFilterBar({
  counts,
  state,
  params,
  basePath,
  className,
}: {
  counts: QuickFilterCounts;
  state: QuickFilterState;
  params: RawParams;
  basePath: string;
  className?: string;
}) {
  const filters = buildQuickFilters(counts, state);
  if (filters.length === 0) return null;
  return (
    <nav aria-label="Filtros rápidos" className={cn("-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible", className)}>
      {filters.map((f) => (
        <QuickFilterPill key={`${f.kind}-${f.id}`} filter={f} href={quickFilterHref(basePath, params, f)} />
      ))}
    </nav>
  );
}

function QuickFilterPill({ filter, href }: { filter: QuickFilter; href: string }) {
  const swatch = filter.kind === "label" ? labelColors(filter.color).background : null;
  const activeStyle = filter.active && filter.kind === "label" ? labelColors(filter.color) : undefined;
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={filter.active}
      title={filter.active ? `Quitar el filtro «${filter.label}»` : `Ver solo «${filter.label}»`}
      style={activeStyle ? { backgroundColor: activeStyle.background, color: activeStyle.color, borderColor: activeStyle.background } : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        filter.active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary"
      )}
    >
      {filter.active ? (
        <Check className="h-3.5 w-3.5" />
      ) : filter.kind === "favorites" ? (
        <Heart className="h-3.5 w-3.5 text-muted-foreground" />
      ) : filter.kind === "discount" ? (
        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
      ) : swatch ? (
        <span aria-hidden className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: swatch }} />
      ) : (
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
      )}
      {filter.label}
      <span className={cn("tabular-nums text-xs", filter.active ? "opacity-80" : "text-muted-foreground")}>{filter.count.toLocaleString("es-AR")}</span>
    </Link>
  );
}
