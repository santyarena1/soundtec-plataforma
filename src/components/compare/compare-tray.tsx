"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, GitCompareArrows, ImageOff, X } from "lucide-react";
import { COMPARE_MAX, COMPARE_MIN, compareHref } from "@/lib/compare/selection";
import { optimizedImage } from "@/lib/image-url";
import { cn } from "@/lib/utils";
import { compareStore, useCompareSelection } from "./compare-store";

/**
 * Barra flotante con los productos elegidos para comparar: miniaturas, quitar
 * uno, vaciar y «Comparar ahora». Va en el layout (portal y catálogo público),
 * así sigue ahí al buscar, cambiar de marca o abrir fichas. No se muestra en la
 * propia página de comparación.
 *
 * `mobileOffset`: en el celular el portal tiene la barra de navegación abajo y
 * el catálogo público el aviso «¿Querés ver precios?»; la barra va arriba de eso.
 */
export function CompareTray({ basePath, mobileOffset = "portal" }: { basePath: string; mobileOffset?: "portal" | "public" }) {
  const items = useCompareSelection();
  const pathname = usePathname();
  if (items.length === 0 || pathname.endsWith("/comparar")) return null;
  const ready = items.length >= COMPARE_MIN;
  const slots = Array.from({ length: COMPARE_MAX }, (_, i) => items[i] ?? null);

  return (
    <>
      {/* Lugar al pie para que la barra no tape lo último de la página. */}
      <div aria-hidden className="h-24 md:h-20" />
      <section
        aria-label="Productos para comparar"
        className={cn(
          "fixed inset-x-3 z-40 md:inset-x-auto md:bottom-6 md:right-6 md:w-[30rem]",
          mobileOffset === "portal" ? "bottom-[max(4.75rem,calc(env(safe-area-inset-bottom)+4.25rem))]" : "bottom-[5.25rem] sm:bottom-6"
        )}
      >
        <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-card/95 p-2.5 pl-3 shadow-2xl ring-1 ring-black/5 backdrop-blur">
          <div className="hidden shrink-0 flex-col leading-tight sm:flex">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <GitCompareArrows className="h-3.5 w-3.5" /> Comparar
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {items.length} de {COMPARE_MAX}
            </span>
          </div>

          <ul className="flex min-w-0 flex-1 items-center gap-1.5">
            {slots.map((item, i) =>
              item ? (
                <li key={item.id} className="group/slot relative">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden sm:h-12 sm:w-12 rounded-lg border border-border bg-white p-1" title={[item.brand, item.name].filter(Boolean).join(" · ")}>
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={optimizedImage(item.image, 96) ?? item.image} alt={item.name} className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <ImageOff className="h-4 w-4 text-muted-foreground/50" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => compareStore.remove(item.id)}
                    aria-label={`Quitar ${item.name} de la comparación`}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:border-destructive/50 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ) : (
                <li key={`empty-${i}`} aria-hidden className="h-10 w-10 rounded-lg border border-dashed sm:h-12 sm:w-12 border-border/80 bg-secondary/40" />
              )
            )}
          </ul>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {ready ? (
              <Link
                href={compareHref(`${basePath}/comparar`, items)}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                <span className="sm:hidden">Comparar</span><span className="hidden sm:inline">Comparar ahora</span> <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="inline-flex h-10 items-center rounded-lg bg-secondary px-3 text-xs font-medium text-muted-foreground">Elegí uno más</span>
            )}
            <button type="button" onClick={() => compareStore.clear()} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">
              Vaciar
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
