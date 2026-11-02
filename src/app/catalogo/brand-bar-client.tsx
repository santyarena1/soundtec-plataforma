"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
export type BrandBarItem = { id: string; name: string; logoUrl: string | null; href: string };

/**
 * Barra de marcas arriba del listado: una sola fila de mosaicos iguales (logo
 * centrado, misma altura), con flechas para recorrerla. La marca elegida queda
 * resaltada y a la vista. Al final, «Ver todas» lleva a la grilla de marcas.
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
  const [edges, setEdges] = useState({ start: true, end: false });

  function updateEdges() {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest", inline: "center" });
    updateEdges();
    const onResize = () => updateEdges();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeBrandId]);

  function scrollBy(direction: 1 | -1) {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  const tile = (active: boolean) =>
    `group flex h-14 w-36 shrink-0 snap-start items-center justify-center rounded-xl border bg-card px-3 transition-all ${
      active ? "border-primary shadow-sm ring-2 ring-primary/30" : "border-border hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
    }`;

  return (
    <nav aria-label="Marcas" className="relative mb-4">
      <div
        ref={scroller}
        onScroll={updateEdges}
        className="-mx-4 flex snap-x gap-2.5 overflow-x-auto scroll-smooth px-4 py-1.5 [scrollbar-width:none] sm:mx-10 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <Link
          href={`${basePath}?all=1`}
          data-active={!activeBrandId}
          className={`flex h-14 shrink-0 snap-start items-center justify-center rounded-xl border px-5 text-sm font-semibold transition ${
            !activeBrandId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"
          }`}
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
                  className={`max-h-7 max-w-full object-contain transition ${active ? "" : "opacity-75 grayscale-[35%] group-hover:opacity-100 group-hover:grayscale-0"}`}
                />
              ) : (
                <span className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">{brand.name}</span>
              )}
            </Link>
          );
        })}
        <Link
          href={basePath}
          className="flex h-14 shrink-0 snap-start items-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <LayoutGrid className="h-4 w-4" />
          Ver todas las marcas
        </Link>
      </div>

      {/* Flechas y difuminado en los bordes (solo desde tablet; en el celular se desliza con el dedo). */}
      <div className={`pointer-events-none absolute inset-y-0 left-10 hidden w-10 bg-gradient-to-r from-background to-transparent transition-opacity sm:block ${edges.start ? "opacity-0" : "opacity-100"}`} />
      <div className={`pointer-events-none absolute inset-y-0 right-10 hidden w-10 bg-gradient-to-l from-background to-transparent transition-opacity sm:block ${edges.end ? "opacity-0" : "opacity-100"}`} />
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        disabled={edges.start}
        aria-label="Ver marcas anteriores"
        className="absolute left-0 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-sm transition hover:border-primary/40 disabled:opacity-30 sm:flex"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => scrollBy(1)}
        disabled={edges.end}
        aria-label="Ver más marcas"
        className="absolute right-0 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-sm transition hover:border-primary/40 disabled:opacity-30 sm:flex"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
