import { optimizedImage } from "@/lib/image-url";
import Link from "next/link";
import { ChevronRight, ImageOff } from "lucide-react";
import { productSubtitle, productTitle, tangoCode } from "@/lib/product-display";
import { formatUsd } from "@/lib/utils";
import { FavoriteButton } from "./favorite-button";
import { StockBadge, priceOnRequest } from "./catalog-grid";
import { Badge } from "@/components/ui/badge";
import type { CatalogProduct } from "@/lib/catalog";
import { AddToDraftButton } from "./add-to-draft-button";
import { SHOW_STOCK_TO_CUSTOMERS } from "@/lib/stock-display";
import { SelectableRowControls } from "./catalog-multi-select";

interface TableProps {
  items: CatalogProduct[];
  publicMode?: boolean;
  basePath?: string;
}

/**
 * Vista «Lista» del catálogo: una fila compacta por producto para comparar
 * rápido. Marca y código arriba, modelo en negrita, una línea de descripción,
 * la categoría y el precio grande a la derecha con su acción.
 */
export function CatalogTable({ items, publicMode = false, basePath = "/portal/products" }: TableProps) {
  const showStock = !publicMode && SHOW_STOCK_TO_CUSTOMERS;
  // Columnas: [selección] foto · producto · categoría · [stock] · [precio] · acciones.
  // Clases literales: Tailwind solo genera las que encuentra escritas enteras.
  const gridClass = publicMode
    ? "grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 md:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,12rem)_6.5rem]"
    : showStock
      ? "grid grid-cols-[2.75rem_3.5rem_minmax(0,1fr)] items-center gap-x-3 md:grid-cols-[2.75rem_3.5rem_minmax(0,1fr)_minmax(0,12rem)_7rem_9.5rem_8.5rem]"
      : "grid grid-cols-[2.75rem_3.5rem_minmax(0,1fr)] items-center gap-x-3 md:grid-cols-[2.75rem_3.5rem_minmax(0,1fr)_minmax(0,12rem)_9.5rem_8.5rem]";

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className={`${gridClass} border-b border-border bg-secondary/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`}>
        {!publicMode ? <span aria-hidden /> : null}
        <span aria-hidden />
        <span>Producto</span>
        <span className="hidden md:block">Categoría</span>
        {showStock ? <span className="hidden md:block">Stock</span> : null}
        {!publicMode ? <span className="hidden text-right md:block">Precio USD</span> : null}
        <span className="hidden md:block" />
      </div>
      <ul className="divide-y divide-border">
        {items.map((p) => {
          const href = `${basePath}/${p.id}`;
          const subtitle = productSubtitle(p);
          const code = tangoCode(p.internalSku);
          const onRequest = priceOnRequest(p);
          return (
            <li key={p.id} className={`${gridClass} px-3 py-2 transition-colors hover:bg-secondary/40`}>
              {!publicMode ? (
                <span className="justify-self-center">
                  <SelectableRowControls productId={p.id} />
                </span>
              ) : null}

              <Link href={href} tabIndex={-1} aria-hidden className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                {p.primaryImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizedImage(p.primaryImage, 96) ?? undefined} alt="" className="h-full w-full object-contain p-1" loading="lazy" decoding="async" />
                ) : (
                  <ImageOff className="h-5 w-5 text-muted-foreground/50" />
                )}
              </Link>

              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {p.brandName || "Sin marca"}
                  {code ? <span className="font-mono normal-case tracking-normal"> · {code}</span> : null}
                </p>
                <div className="flex min-w-0 items-baseline gap-2">
                  <Link href={href} className="truncate text-sm font-semibold text-foreground hover:underline" title={productTitle(p)}>
                    {productTitle(p)}
                  </Link>
                  <span className="flex shrink-0 gap-1">
                    {p.kind === "ACCESORIO" ? <Badge tone="neutral">Accesorio</Badge> : null}
                    {p.isCrestronHomeCompatible ? <Badge tone="primary">Crestron Home</Badge> : null}
                    {p.isDiscontinued ? <Badge tone="muted">Discontinuado</Badge> : null}
                  </span>
                </div>
                {subtitle ? <p className="truncate text-xs text-muted-foreground" title={subtitle}>{subtitle}</p> : null}
                {/* En pantallas chicas, categoría y precio van debajo del nombre. */}
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground md:hidden">
                  {p.categoryName ? <span>{p.categoryName}</span> : null}
                  {!publicMode ? (
                    <span className="font-semibold text-foreground">{onRequest ? "Consultá precio" : formatUsd(p.pricing!.finalPriceUsd)}</span>
                  ) : null}
                </p>
              </div>

              <div className="hidden min-w-0 md:block">
                {p.categoryName ? (
                  <>
                    <p className="truncate text-sm">{p.categoryName}</p>
                    {p.familyName ? <p className="truncate text-xs text-muted-foreground">{p.familyName}</p> : null}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>

              {showStock ? (
                <div className="hidden md:block">
                  <StockBadge status={p.stockStatus} qty={p.stockQuantity} />
                </div>
              ) : null}

              {!publicMode ? (
                <div className="hidden text-right md:block">
                  {onRequest ? (
                    <p className="text-sm font-semibold text-muted-foreground">Consultá precio</p>
                  ) : (
                    <>
                      {p.pricing!.priceBeforeDiscountUsd && p.pricing!.discountPercent > 0 ? (
                        <p className="text-xs tabular-nums text-muted-foreground line-through">{formatUsd(p.pricing!.priceBeforeDiscountUsd)}</p>
                      ) : null}
                      <p className="text-[15px] font-semibold tabular-nums">{formatUsd(p.pricing!.finalPriceUsd)}</p>
                      {p.pricing!.discountPercent > 0 ? (
                        <Badge tone="success" className="mt-0.5">
                          -{p.pricing!.discountPercent.toFixed(1)}%
                        </Badge>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              <div className="col-span-full flex items-center justify-end gap-2 pt-1 md:col-span-1 md:pt-0">
                {publicMode ? (
                  <Link href={href} className="inline-flex items-center gap-0.5 text-sm font-medium text-accent hover:underline">
                    Ver ficha <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <>
                    <AddToDraftButton productId={p.id} productName={p.normalizedName} compact />
                    <FavoriteButton productId={p.id} isFavorite={p.isFavorite} />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
