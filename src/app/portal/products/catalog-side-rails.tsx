import Link from "next/link";
import { brandHref, type CatalogBrand } from "@/lib/catalog-brands";
import type { FacetOption } from "@/lib/catalog";
import { cn } from "@/lib/utils";

type RawParams = Record<string, string | string[] | undefined>;

/** Mismo listado con un parámetro cambiado (y siempre desde la página 1). */
function hrefWith(basePath: string, params: RawParams, key: string, value: string | null): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === key || k === "page" || k === "all" || v == null) continue;
    if (Array.isArray(v)) for (const item of v) next.append(k, item);
    else next.set(k, v);
  }
  if (value) next.set(key, value);
  const query = next.toString();
  return query ? `${basePath}?${query}` : `${basePath}?all=1`;
}

/**
 * Columnas a los costados del catálogo del portal: rubros a la izquierda y
 * marcas a la derecha. Van en el margen libre de las pantallas anchas
 * (≥ 1700 px), afuera del contenido: la columna central no cambia de ancho.
 * Por debajo de ese ancho no se muestran y queda la fila de marcas de arriba.
 */
export function CatalogSideRails({
  categories,
  brands,
  activeCategoryIds,
  activeBrandId,
  params,
  basePath,
}: {
  categories: FacetOption[];
  brands: CatalogBrand[];
  activeCategoryIds: string[];
  activeBrandId: string | null;
  params: RawParams;
  basePath: string;
}) {
  // !mt-0: el contenedor reparte espacio con space-y y no tiene que correr las columnas.
  const rail = "pointer-events-none absolute top-0 !mt-0 hidden h-full w-52 min-[1700px]:block";
  const panel =
    "pointer-events-auto sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-sm [scrollbar-width:thin]";

  return (
    <>
      <aside aria-label="Rubros" className={cn(rail, "right-full mr-6")}>
        <nav className={panel}>
          <p className="px-2.5 pb-2 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rubros</p>
          <ul className="space-y-0.5">
            <li>
              <Link
                href={hrefWith(basePath, params, "category", null)}
                className={cn(
                  "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  activeCategoryIds.length === 0 ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                )}
              >
                Todos los rubros
              </Link>
            </li>
            {categories.map((category) => {
              const active = activeCategoryIds.includes(category.id);
              return (
                <li key={category.id}>
                  <Link
                    href={hrefWith(basePath, params, "category", active ? null : category.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
                    )}
                  >
                    <span className="truncate">{category.name}</span>
                    <span className={cn("shrink-0 text-xs tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {category.count.toLocaleString("es-AR")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <aside aria-label="Marcas" className={cn(rail, "left-full ml-6")}>
        <nav className={panel}>
          <p className="px-2.5 pb-2 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Marcas</p>
          <ul className="space-y-1.5">
            <li>
              <Link
                href={`${basePath}?all=1`}
                className={cn(
                  "flex h-10 items-center justify-center rounded-lg border text-sm font-semibold transition",
                  !activeBrandId ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40"
                )}
              >
                Todas las marcas
              </Link>
            </li>
            {brands.map((brand) => {
              const active = brand.id === activeBrandId;
              return (
                <li key={brand.id}>
                  <Link
                    href={brandHref(brand, basePath)}
                    title={brand.name}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex h-12 items-center justify-center rounded-lg border bg-card px-3 transition",
                      active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40 hover:shadow-sm"
                    )}
                  >
                    {brand.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={brand.logoUrl}
                        alt={brand.name}
                        className={cn(
                          "max-h-7 max-w-full object-contain transition",
                          active ? "" : "opacity-75 grayscale-[35%] group-hover:opacity-100 group-hover:grayscale-0"
                        )}
                        loading="lazy"
                      />
                    ) : (
                      <span className="truncate text-xs font-semibold uppercase tracking-wide">{brand.name}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
