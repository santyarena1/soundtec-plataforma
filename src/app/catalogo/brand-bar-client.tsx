"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { brandLogoFit } from "@/lib/brand-logo-fit";
import { cn } from "@/lib/utils";
export type BrandBarItem = { id: string; name: string; logoUrl: string | null; href: string };

/** Alto de un mosaico (h-14) y separación (gap-2): con esto se recortan los dos renglones. */
const TILE_PX = 56;
const GAP_PX = 8;
const TWO_ROWS_PX = TILE_PX * 2 + GAP_PX;

// En el servidor no hay layout: el efecto corre igual en el cliente sin avisos.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Marcas arriba del listado: mosaicos parejos con el logo a color pleno. La
 * elegida lleva solo un recuadro marcado. En tablet y PC se ven dos renglones
 * y «Ver todas» despliega el resto en el lugar; si la marca elegida quedó en
 * la parte oculta, se abre solo. En el celular los dos renglones se deslizan
 * con el dedo.
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
  const grid = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);
  // Logo que no carga: se muestra el nombre en vez del ícono de imagen rota.
  const [brokenLogos, setBrokenLogos] = useState<ReadonlySet<string>>(new Set());

  // Cuántos mosaicos caen debajo del segundo renglón (0 en el celular, donde todo se desliza).
  const measure = useCallback(() => {
    const el = grid.current;
    if (!el) return { hidden: 0, activeHidden: false };
    const tiles = Array.from(el.children) as HTMLElement[];
    const top = tiles[0]?.offsetTop ?? 0;
    let hidden = 0;
    let activeHidden = false;
    for (const tile of tiles) {
      if (tile.offsetTop - top < TWO_ROWS_PX) continue;
      hidden += 1;
      if (tile.dataset.active === "true") activeHidden = true;
    }
    return { hidden, activeHidden };
  }, []);

  useIsoLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const sync = () => setHiddenCount(measure().hidden);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, brands.length]);

  // La marca elegida siempre a la vista: desplegado (tablet/PC) o centrada en la tira (celular).
  useIsoLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    if (measure().activeHidden) setExpanded(true);
    if (el.scrollWidth > el.clientWidth) {
      const active = el.querySelector<HTMLElement>("[data-active='true']");
      if (active) el.scrollLeft = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
    }
  }, [activeBrandId, measure]);

  // Un logo que falló antes de hidratar no dispara onError: se revisa al montar.
  useEffect(() => {
    const failed = Array.from(grid.current?.querySelectorAll<HTMLImageElement>("img[data-brand-id]") ?? [])
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.dataset.brandId!);
    if (failed.length) setBrokenLogos((prev) => new Set([...prev, ...failed]));
  }, [brands]);

  const tile = (active: boolean) =>
    cn(
      "flex h-14 min-w-0 items-center justify-center rounded-lg border bg-card px-3 outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      active
        ? "border-primary shadow-[inset_0_0_0_1px_hsl(var(--primary))]"
        : "border-border hover:border-foreground/25 hover:shadow-[0_1px_3px_rgb(15_23_42/0.08)]"
    );

  return (
    <nav aria-label="Marcas">
      <div className="mb-2 hidden items-center justify-between md:flex">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Marcas</h2>
        {hiddenCount > 0 || expanded ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/5"
          >
            {expanded ? "Ver menos" : `Ver todas (+${hiddenCount})`}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />
          </button>
        ) : null}
      </div>
      <div
        ref={grid}
        style={expanded ? undefined : ({ "--brand-clip": `${TWO_ROWS_PX}px` } as React.CSSProperties)}
        className={cn(
          // Celular: dos renglones que se deslizan.
          "-mx-4 grid auto-cols-[8.5rem] grid-flow-col grid-rows-2 gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Tablet y PC: mosaicos que llenan el ancho; dos renglones salvo que se despliegue.
          "md:mx-0 md:auto-cols-auto md:grid-flow-row md:grid-rows-none md:overflow-hidden md:px-0 md:[grid-template-columns:repeat(auto-fill,minmax(8.5rem,1fr))] md:max-h-[var(--brand-clip,none)]"
        )}
      >
        <Link
          href={`${basePath}?all=1`}
          data-active={!activeBrandId}
          aria-current={!activeBrandId ? "page" : undefined}
          className={cn(tile(!activeBrandId), "text-sm font-semibold text-foreground")}
        >
          Todas
        </Link>
        {brands.map((brand) => {
          const active = brand.id === activeBrandId;
          return (
            <Link key={brand.id} href={brand.href} data-active={active} title={brand.name} aria-current={active ? "page" : undefined} className={tile(active)}>
              {brand.logoUrl && !brokenLogos.has(brand.id) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brand.logoUrl}
                  alt={brand.name}
                  data-brand-id={brand.id}
                  loading="lazy"
                  onError={() => setBrokenLogos((prev) => new Set(prev).add(brand.id))}
                  className={brandLogoFit(brand.id).compact ? "h-12 w-full object-cover" : "max-h-10 w-full object-contain"}
                />
              ) : (
                <span className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">{brand.name}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
