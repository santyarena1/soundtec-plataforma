import { optimizedImage } from "@/lib/image-url";
import Link from "next/link";
import { ArrowRight, ImageOff } from "lucide-react";
import { productSubtitle, productTitle, tangoCode } from "@/lib/product-display";
import { FavoriteButton } from "./favorite-button";
import { StockBadge, priceOnRequest } from "./catalog-grid";
import type { CatalogProduct } from "@/lib/catalog";
import { AddToDraftButton } from "./add-to-draft-button";
import { SelectableRowControls } from "./catalog-multi-select";
import { commercialTagFor } from "@/lib/commercial-tags";
import { seriesChipLabel } from "@/lib/product-lines/chip";
import { CUSTOMER_ORDERS_ENABLED } from "@/lib/customer-orders";
import { CommercialTagBadge, ProductLabelChips } from "@/components/catalog/commercial-tag-badge";
import { ProductPrice } from "@/components/catalog/product-price";
import { CompareToggle } from "@/components/compare/compare-toggle";

interface TableProps {
  items: CatalogProduct[];
  publicMode?: boolean;
  basePath?: string;
  /** Equipo Soundtec: stock en origen (proveedor) en vez de «Consultá stock». */
  internal?: boolean;
}

/** Cartel comercial sobre la foto (ver lib/commercial-tags): siempre en la misma esquina. */
function promoTag(p: CatalogProduct) {
  return commercialTagFor({
    commercialTag: p.commercialTag,
    discountPercent: p.pricing?.discountPercent ?? null,
    priceOnRequest: priceOnRequest(p),
  });
}

/**
 * Vista «Lista» del catálogo: una vitrina horizontal por producto. Foto grande,
 * marca y categoría arriba, el modelo bien visible, una descripción que se lee
 * de corrido y, a la derecha, el precio grande con su acción. Pensada para
 * leerse cómoda (letra generosa, buen contraste) y para invitar a abrir la ficha.
 */
export function CatalogTable({ items, publicMode = false, basePath = "/portal/products", internal = false }: TableProps) {
  return (
    <ul className="space-y-4">
      {items.map((p) => {
        const href = `${basePath}/${p.id}`;
        const subtitle = productSubtitle(p);
        // Código Tango: solo el equipo de Soundtec (en el portal; nunca en el público).
        const code = internal && !publicMode ? tangoCode(p.internalSku) : null;
        const onRequest = priceOnRequest(p);
        const promo = promoTag(p);
        const crumbs = [p.categoryName, seriesChipLabel(p)].filter(Boolean).join(" · ");
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
              {promo || p.labels.length ? (
                <span className="absolute left-3 top-3 flex flex-col items-start gap-1">
                  {promo ? <CommercialTagBadge tag={promo} size="row" /> : null}
                  <ProductLabelChips labels={p.labels} size="row" max={3} />
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
              <Link href={href} className="text-[1.375rem] font-semibold leading-tight text-foreground hover:text-primary sm:text-2xl">
                {productTitle(p)}
              </Link>
              {subtitle ? <p className="line-clamp-3 max-w-[62ch] text-[15px] leading-relaxed text-foreground/75">{subtitle}</p> : null}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-[13px]">
                {p.kind === "ACCESORIO" ? <span className="rounded-full border border-border px-2.5 py-0.5 text-muted-foreground">Accesorio</span> : null}
                {p.isCrestronHomeCompatible ? (
                  <span className="rounded-full border border-primary/25 bg-primary/5 px-2.5 py-0.5 font-medium text-primary">Compatible Crestron Home</span>
                ) : null}
                {code ? <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-muted-foreground">Cód. {code}</span> : null}
                <StockBadge status={p.stockStatus} qty={p.stockQuantity} internal={internal && !publicMode} />
                <CompareToggle variant="inline" product={{ id: p.id, name: productTitle(p), brand: p.brandName, image: p.primaryImage }} />
                <Link href={href} className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  Ver ficha completa <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>

            {/* Precio y acción. */}
            <div className="flex flex-col justify-center gap-3 border-t border-border bg-secondary/30 p-5 sm:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:p-6">
              {publicMode ? (
                <>
                  <p className="text-sm leading-relaxed text-muted-foreground">{CUSTOMER_ORDERS_ENABLED ? "Ingresá con tu cuenta para ver precios y armar tu pedido." : "Ingresá con tu cuenta para ver precios."}</p>
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
                      <p className="mt-1 text-lg font-semibold text-foreground">Consultá precio</p>
                    ) : (
                      <>
                        <ProductPrice
                          className="mt-1"
                          finalUsd={p.pricing!.finalPriceUsd}
                          regularUsd={p.pricing!.priceBeforeDiscountUsd}
                          discountPercent={p.pricing!.discountPercent}
                          size="row"
                        />
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
