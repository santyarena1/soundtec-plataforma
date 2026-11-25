"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { brandLogoFit } from "@/lib/brand-logo-fit";
import { cn } from "@/lib/utils";

/** Marca lista para dibujar (los enlaces ya vienen armados del servidor). */
export type BrandUiItem = {
  id: string;
  name: string;
  logoUrl: string | null;
  href: string;
  comingSoon?: boolean;
  /** Todavía sin productos: el enlace lleva a la consulta. */
  inquiry?: boolean;
  /** Nombre escrito al lado del logo, con rótulo opcional debajo ("" = solo el nombre; ej. Crestron Home). */
  caption?: string;
};
export type BrandUiCell = { type: "brand"; brand: BrandUiItem } | { type: "soon"; name: string };

/**
 * Logos que no cargan: se muestra el nombre en vez del ícono roto. Un logo que
 * falló antes de hidratar no dispara onError, por eso se revisa al montar.
 */
export function useBrokenLogos(root: RefObject<HTMLElement>, deps: unknown[]) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const failed = Array.from(root.current?.querySelectorAll<HTMLImageElement>("img[data-brand-id]") ?? [])
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.dataset.brandId!);
    if (failed.length) setBroken((prev) => new Set([...prev, ...failed]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  const markBroken = useCallback((id: string) => setBroken((prev) => new Set(prev).add(id)), []);
  return { broken, markBroken };
}

/**
 * Logo a color pleno con su alto según el lugar. Crestron Home (isotipo casi
 * cuadrado en un lienzo ancho) se recorta para que pese igual que el resto.
 */
export function BrandLogo({
  brand,
  heightClass,
  compactClass,
  broken,
  onBroken,
  nameClass,
}: {
  brand: BrandUiItem;
  heightClass: string;
  compactClass: string;
  broken: ReadonlySet<string>;
  onBroken: (id: string) => void;
  nameClass?: string;
}) {
  if (!brand.logoUrl || broken.has(brand.id)) return <BrandName name={brand.name} className={nameClass} />;
  const compact = brandLogoFit(brand.id).compact;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand.logoUrl}
      alt={brand.name}
      data-brand-id={brand.id}
      loading="lazy"
      draggable={false}
      onError={() => onBroken(brand.id)}
      className={cn("max-w-full select-none", compact ? cn(compactClass, "scale-[1.3] object-cover") : cn(heightClass, "w-auto object-contain"))}
    />
  );
}

/** Nombre bien tipografiado cuando no hay logo (o la marca todavía no está cargada). */
export function BrandName({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("max-w-full truncate text-sm font-semibold uppercase leading-none tracking-[0.18em] text-foreground/85", className)}>
      {name}
    </span>
  );
}

export function SoonTag({ className }: { className?: string }) {
  return <span className={cn("text-[9px] font-medium uppercase leading-none tracking-[0.14em] text-muted-foreground", className)}>Próximamente</span>;
}
