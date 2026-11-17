"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { brandLogoFit } from "@/lib/brand-logo-fit";
import { cn } from "@/lib/utils";
export type BrandBarItem = { id: string; name: string; logoUrl: string | null; href: string };

/**
 * Marcas arriba del listado: todas a la vista siempre, en mosaicos parejos con
 * el logo a color pleno, siempre en dos renglones (las columnas se reparten el
 * ancho). La elegida lleva solo un recuadro marcado. En el celular los dos
 * renglones se deslizan con el dedo.
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
  // Logo que no carga: se muestra el nombre en vez del ícono de imagen rota.
  const [brokenLogos, setBrokenLogos] = useState<ReadonlySet<string>>(new Set());

  // Un logo que falló antes de hidratar no dispara onError: se revisa al montar.
  useEffect(() => {
    const failed = Array.from(grid.current?.querySelectorAll<HTMLImageElement>("img[data-brand-id]") ?? [])
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.dataset.brandId!);
    if (failed.length) setBrokenLogos((prev) => new Set([...prev, ...failed]));
  }, [brands]);

  const tile = (active: boolean) =>
    cn(
      "flex h-10 min-w-0 items-center justify-center rounded-md border bg-card px-1.5 outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring 2xl:h-11 2xl:px-2",
      active
        ? "border-primary shadow-[inset_0_0_0_1px_hsl(var(--primary))]"
        : "border-border hover:border-foreground/25 hover:shadow-[0_1px_3px_rgb(15_23_42/0.08)]"
    );

  return (
    <nav aria-label="Marcas">
      <h2 className="mb-2 hidden text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground md:block">Marcas</h2>
      <div
        ref={grid}
        // Columnas = la mitad de los mosaicos (redondeado arriba): dos renglones exactos, leídos de izquierda a derecha.
        style={{ "--brand-cols": Math.ceil((brands.length + 1) / 2) } as React.CSSProperties}
        className="-mx-4 grid auto-cols-[6.5rem] grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid-flow-row md:grid-rows-none md:overflow-visible md:px-0 md:[grid-template-columns:repeat(var(--brand-cols),minmax(0,1fr))]"
      >
        <Link
          href={`${basePath}?all=1`}
          data-active={!activeBrandId}
          aria-current={!activeBrandId ? "page" : undefined}
          className={cn(tile(!activeBrandId), "text-xs font-semibold text-foreground")}
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
                  className={brandLogoFit(brand.id).compact ? "h-9 w-full object-cover 2xl:h-10" : "max-h-6 w-full object-contain 2xl:max-h-7"}
                />
              ) : (
                <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-foreground">{brand.name}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
