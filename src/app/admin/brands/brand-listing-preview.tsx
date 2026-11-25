"use client";

import { Loader2, Star } from "lucide-react";
import { optimizedImage } from "@/lib/image-url";
import type { BrandPreview } from "@/server/actions/brand-listing";

/**
 * «Así lo ve el cliente»: los primeros productos de la marca en el orden real
 * (destacados arriba, después cada rubro con su encabezado), como en el portal.
 */
export function BrandListingPreview({
  brandName,
  preview,
  loading,
  error,
  dirty,
}: {
  brandName: string;
  preview: BrandPreview | null;
  loading: boolean;
  error: string | null;
  dirty: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-border bg-secondary/30">
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-semibold">Así lo ve el cliente</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {preview ? `${Math.min(preview.items.length, preview.total)} de ${preview.total}` : null}
        </p>
      </div>
      {dirty ? (
        <p className="border-b border-border bg-warning/10 px-3 py-1.5 text-xs text-warning">Vista previa con el orden sin guardar.</p>
      ) : null}
      <div className="max-h-[32rem] min-h-[12rem] overflow-y-auto px-3 py-2">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!preview && !error ? <p className="py-6 text-center text-xs text-muted-foreground">Armando la vista previa…</p> : null}
        {preview && preview.items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{brandName} no tiene productos visibles para clientes.</p>
        ) : null}
        {preview?.sections.length
          ? preview.sections.map((section, i) => {
              const items = preview.items.slice(section.startIndex, preview.sections[i + 1]?.startIndex ?? preview.items.length);
              return (
                <div key={`${section.key}-${section.startIndex}`} className="mb-3 last:mb-0">
                  <p className="sticky top-0 z-[1] -mx-3 flex items-baseline gap-1.5 bg-secondary/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
                    {section.kind === "featured" ? <Star className="h-3 w-3 shrink-0 fill-current text-accent" aria-hidden /> : null}
                    <span className="truncate">{section.title}</span>
                    {section.chosenPosition != null ? (
                      <span className="shrink-0 rounded bg-accent/15 px-1 font-medium normal-case tracking-normal text-accent">
                        {section.chosenPosition + 1}.º en el orden
                      </span>
                    ) : section.kind === "rubro" ? (
                      <span className="shrink-0 font-normal normal-case tracking-normal text-muted-foreground">por nombre</span>
                    ) : null}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-center gap-2 rounded-md bg-card px-1.5 py-1 text-xs">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-white">
                          {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={optimizedImage(item.image, 96) ?? undefined} alt="" className="h-full w-full object-contain" loading="lazy" />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium" title={item.title}>
                          {item.title}
                        </span>
                        {item.categoryName ? <span className="hidden shrink-0 truncate text-muted-foreground sm:inline">{item.categoryName}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          : null}
        {preview && preview.total > preview.items.length ? (
          <p className="pt-1 text-center text-[11px] text-muted-foreground">… y {preview.total - preview.items.length} más, en el mismo orden.</p>
        ) : null}
      </div>
    </div>
  );
}
