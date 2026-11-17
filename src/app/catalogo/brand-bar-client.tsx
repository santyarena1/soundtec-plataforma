"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { LayoutGrid } from "lucide-react";
import { brandLogoFit } from "@/lib/brand-logo-fit";
import { cn } from "@/lib/utils";
export type BrandBarItem = { id: string; name: string; logoUrl: string | null; href: string };

/**
 * Marcas arriba del listado, en dos renglones de mosaicos iguales (logo
 * centrado, misma altura), sin flechas. En PC entran todas; en tablet arman
 * una grilla compacta y en el celular los dos renglones se deslizan con el
 * dedo. La marca elegida queda resaltada. Al final, «Ver todas las marcas»
 * lleva a la grilla de marcas.
 */
export function BrandBarClient({
  brands,
  activeBrandId,
  basePath,
}: {
  brands: BrandBarItem[];
  activeBrandId: string | null;
  basePath: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // «Todas» + marcas + «Ver todas las marcas», repartidas en dos renglones.
  const columns = Math.ceil((brands.length + 2) / 2);

  // En el celular (renglones deslizables) la marca elegida queda a la vista, sin mover la página.
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const active = el.querySelector<HTMLElement>("[data-active='true']");
    if (active) el.scrollLeft = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
  }, [activeBrandId]);

  const tile = (active: boolean) =>
    cn(
      "group flex h-12 min-w-0 items-center justify-center rounded-lg border bg-card px-2.5 transition-all",
      active ? "border-primary shadow-sm ring-2 ring-primary/30" : "border-border hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
    );

  return (
    <nav aria-label="Marcas" className="mb-4">
      <div
        ref={scroller}
        style={{ "--brand-cols": columns } as React.CSSProperties}
        className={cn(
          // Celular: dos renglones que se deslizan.
          "-mx-4 grid auto-cols-[6.75rem] grid-flow-col grid-rows-2 gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Tablet y notebook chica: grilla compacta, sin desplazamiento.
          "md:mx-0 md:auto-cols-auto md:grid-flow-row md:grid-rows-none md:overflow-visible md:px-0 md:[grid-template-columns:repeat(auto-fill,minmax(7rem,1fr))]",
          // PC: todas las marcas en dos renglones.
          "xl:[grid-template-columns:repeat(var(--brand-cols),minmax(0,1fr))]"
        )}
      >
        <Link
          href={`${basePath}?all=1`}
          data-active={!activeBrandId}
          className={cn(
            "flex h-12 items-center justify-center rounded-lg border px-2 text-sm font-semibold transition",
            !activeBrandId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"
          )}
        >
          Todas
        </Link>
        {brands.map((brand) => {
          const active = brand.id === activeBrandId;
          return (
            <Link key={brand.id} href={brand.href} data-active={active} title={brand.name} aria-current={active ? "page" : undefined} className={tile(active)}>
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brand.logoUrl}
                  alt={brand.name}
                  className={cn(
                    brandLogoFit(brand.id).compact ? "h-10 w-full object-cover" : "max-h-6 max-w-full object-contain",
                    "transition",
                    !active && "opacity-75 grayscale-[35%] group-hover:opacity-100 group-hover:grayscale-0"
                  )}
                />
              ) : (
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-foreground">{brand.name}</span>
              )}
            </Link>
          );
        })}
        <Link
          href={basePath}
          title="Ver todas las marcas"
          className="flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 text-center text-xs font-medium leading-tight text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
          Ver marcas
        </Link>
      </div>
    </nav>
  );
}
