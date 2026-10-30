import { optimizedImage } from "@/lib/image-url";
import Link from "next/link";
import { ArrowRight, ImageOff } from "lucide-react";
import { productSubtitle, productTitle, tangoCode } from "@/lib/product-display";
import { formatUsd } from "@/lib/utils";
import { FavoriteButton } from "./favorite-button";
import { StockBadge, priceOnRequest } from "./catalog-grid";
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
 * Etiqueta comercial sobre la foto. Hoy: oferta (descuento). Acá se suman
 * liquidación, novedad, etc. cuando existan esos módulos: un solo lugar,
 * siempre en la misma esquina, para que el cliente aprenda a buscarla.
 */
function promoTag(p: CatalogProduct): { label: string; className: string } | null {
  if (p.pricing && p.pricing.discountPercent > 0 && !priceOnRequest(p)) {
    return { label: `Oferta −${Math.round(p.pricing.discountPercent)}%`, className: "bg-[#b4232c] text-white" };
  }
  if (p.isDiscontinued) return { label: "Últimas unidades", className: "bg-foreground text-background" };
  return null;
}

/**
 * Vista «Lista» del catálogo: una vitrina horizontal por producto. Foto grande,
 * marca y categoría arriba, el modelo bien visible, una descripción que se lee
 * de corrido y, a la derecha, el precio grande con su acción. Pensada para
 * leerse cómoda (letra generosa, buen contraste) y para invitar a abrir la ficha.
 */
export function CatalogTable({ items, publicMode = false, basePath = "/portal/products" }: TableProps) {
  return (
    <ul className="space-y-4">
      {items.map((p) => {
        const href = `${basePath}/${p.id}`;
        const subtitle = productSubtitle(p);
        const code = tangoCode(p.internalSku);
        const onRequest = priceOnRequest(p);
        const promo = promoTag(p);
        const crumbs = [p.categoryName, p.familyName].filter(Boolean).join(" · ");
        return (
          <li
            key={p.id}
            className="group relative grid overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg sm:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)_17rem]"
          >
            {/* Foto: grande, sobre blanco, con la etiqueta comercial en la esquina. */}
            <Link
              href={href}
              className="relative flex h-56 items-center justify-center bg-white p-6 sm:h-full sm:min-h-[13rem] sm:border-r sm:border-border"
              aria-label={`Ver ${productTitle(p)}`}
            >
              {p.primaryImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={optimizedImage(p.primaryImage, 384) ?? undefined}
                  alt={productTitle(p)}
                  className="max-h-44 max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <ImageOff className="h-8 w-8 opacity-40" />
                  Foto a confirmar
                </span>
              )}
              {promo ? (
                <span className={`absolute left-3 top-3 rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide shadow-sm ${promo.className}`}>
                  {promo.label}
                </span>
              ) : null}
            </Link>

            {/* Información: lo que se lee para decidir abrir la ficha. */}
            <div className="flex min-w-0 flex-col gap-2 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-primary">
                  {p.brandName || "Sin marca"}
                  {crumbs ? <span className="font-normal normal-case tracking-normal text-muted-foreground"> — {crumbs}</span> : null}
                </p>
                {!publicMode ? (
                  <span className="shrink-0">
                    <SelectableRowControls productId={p.id} />
                  </span>
                ) : null}
              </div>
              <Link href={href} className="text-xl font-semibold leading-tight text-foreground hover:text-primary sm:text-[1.375rem]">
                {productTitle(p)}
              </Link>
              {subtitle ? <p className="line-clamp-3 max-w-[62ch] text-[15px] leading-relaxed text-foreground/75">{subtitle}</p> : null}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-[13px]">
                {p.kind === "ACCESORIO" ? <span className="rounded-full border border-border px-2.5 py-0.5 text-muted-foreground">Accesorio</span> : null}
                {p.isCrestronHomeCompatible ? (
                  <span className="rounded-full border border-primary/25 bg-primary/5 px-2.5 py-0.5 font-medium text-primary">Compatible Crestron Home</span>
                ) : null}
                {code ? <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-muted-foreground">Cód. {code}</span> : null}
                {!publicMode && SHOW_STOCK_TO_CUSTOMERS ? <StockBadge status={p.stockStatus} qty={p.stockQuantity} /> : null}
                <Link href={href} className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  Ver ficha completa <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>

            {/* Precio y acción. */}
            <div className="flex flex-col justify-center gap-3 border-t border-border bg-secondary/30 p-5 sm:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:p-6">
              {publicMode ? (
                <>
                  <p className="text-sm leading-relaxed text-muted-foreground">Ingresá con tu cuenta para ver precios y armar tu pedido.</p>
                  <Link
                    href={href}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Ver ficha <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Precio USD</p>
                    {onRequest ? (
                      <p className="mt-1 text-xl font-semibold text-foreground">Consultá precio</p>
                    ) : (
                      <>
                        {p.pricing!.priceBeforeDiscountUsd && p.pricing!.discountPercent > 0 ? (
                          <p className="mt-1 text-sm tabular-nums text-muted-foreground line-through">{formatUsd(p.pricing!.priceBeforeDiscountUsd)}</p>
                        ) : null}
                        <p className="text-[1.75rem] font-bold leading-tight tabular-nums text-foreground">{formatUsd(p.pricing!.finalPriceUsd)}</p>
                        <p className="text-xs text-muted-foreground">+ IVA</p>
                      </>
                    )}
                  </div>
                  <AddToDraftButton productId={p.id} productName={p.normalizedName} />
                  <div className="flex justify-center">
                    <FavoriteButton productId={p.id} isFavorite={p.isFavorite} label />
                  </div>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
