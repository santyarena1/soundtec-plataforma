"use client";

import { Loader2 } from "lucide-react";
import { optimizedImage } from "@/lib/image-url";
import type { BrandPreview } from "@/server/actions/brand-listing";

/**
 * «Así lo ve el cliente»: los primeros productos de la marca en el orden real
 * (destacados arriba, después los rubros en el orden elegido) en una sola
 * grilla continua, sin títulos ni estrellas, como en el portal.
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
        {preview?.items.length ? (
          <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {preview.items.map((item, index) => (
              <li key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card" title={item.categoryName ? `${item.title} · ${item.categoryName}` : item.title}>
                <span className="relative flex aspect-[4/3] items-center justify-center bg-white">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={optimizedImage(item.image, 256) ?? undefined} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
                  ) : null}
                  <span className="absolute left-1 top-1 rounded bg-background/85 px-1 text-[10px] font-medium tabular-nums text-muted-foreground">{index + 1}</span>
                </span>
                <span className="line-clamp-2 px-1.5 py-1 text-[11px] font-medium leading-snug">{item.title}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {preview && preview.total > preview.items.length ? (
          <p className="pt-1 text-center text-[11px] text-muted-foreground">… y {preview.total - preview.items.length} más, en el mismo orden.</p>
        ) : null}
      </div>
    </div>
  );
}
