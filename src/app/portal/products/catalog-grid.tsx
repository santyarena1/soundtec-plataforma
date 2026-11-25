import { optimizedImage } from "@/lib/image-url";
import { productSubtitle, productTitle } from "@/lib/product-display";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FavoriteButton } from "./favorite-button";
import { Settings2 } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { AddToDraftButton } from "./add-to-draft-button";
import { SelectableCard } from "./catalog-multi-select";
import { StockBadge } from "@/components/catalog/stock-badge";
import { FeaturedStarButton } from "./featured-star-button";
import { FeaturedRubroButton } from "@/components/catalog/featured-rubro-button";
import type { ProductRubroHighlight } from "@/server/catalog/brand-listing-data";
import { commercialTagFor } from "@/lib/commercial-tags";
import { seriesChipLabel } from "@/lib/product-lines/chip";
import { CommercialTagBadge, ProductLabelChips } from "@/components/catalog/commercial-tag-badge";
import { ProductPrice } from "@/components/catalog/product-price";
import { CompareToggle } from "@/components/compare/compare-toggle";

interface GridProps {
  items: CatalogProduct[];
  /** Catálogo público: sin precio, stock, favoritos ni «agregar». */
  publicMode?: boolean;
  /** Base de los links a la ficha (default: portal). */
  basePath?: string;
  /** Equipo Soundtec: ve el stock en origen (proveedor) en vez de «Consultá stock». */
  internal?: boolean;
  /** Puede destacar productos (estrella) desde la grilla. */
  canFeature?: boolean;
  /** Con el sidebar de rubros al lado: 3 columnas hasta que el sidebar sale al margen (1800 px). */
  withSidebar?: boolean;
  /** Estado de «Destacar rubro en su marca» por producto (solo con canFeature). */
  rubroHighlights?: Record<string, ProductRubroHighlight>;
}

/**
 * Card de producto con estructura FIJA: cada zona tiene altura reservada, así
 * las cards alinean entre sí sin importar el largo del nombre o cuántas
 * etiquetas tenga el producto.
 *
 *  ┌──────────────────────┐
 *  │ imagen (4:3)  [♥]    │  ← altura fija por aspect ratio
 *  ├──────────────────────┤
 *  │ MARCA · SKU          │  ← 1 línea
 *  │ Nombre del producto  │  ← 2 líneas reservadas
 *  │ Descripción corta    │  ← 2 líneas reservadas
 *  │ [categoría] [tag]    │  ← 1 fila, sin wrap
 *  │ USD 1.234,00         │  ← siempre abajo (o "Consultá precio")
 *  │ [ Agregar ]          │
 *  └──────────────────────┘
 */
export function CatalogGrid({ items, publicMode = false, basePath = "/portal/products", internal = false, canFeature = false, withSidebar = false, rubroHighlights }: GridProps) {
  return (
    <div className={withSidebar ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}>
      {items.map((p) => {
        const href = `${basePath}/${p.id}`;
        const card = (
          <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-elevated">
            <div className="relative">
              <Link href={href} className="block" aria-label={p.normalizedName}>
                <div className="aspect-[4/3] w-full overflow-hidden bg-white p-3">
                  {p.primaryImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={optimizedImage(p.primaryImage, 384) ?? undefined}
                      alt={p.normalizedName}
                      className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sin imagen</div>
                  )}
                </div>
              </Link>
              {!publicMode ? (
                <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
                  <FavoriteButton productId={p.id} isFavorite={p.isFavorite} />
                  {canFeature ? <FeaturedStarButton productId={p.id} isFeatured={p.isFeatured} /> : null}
                  {canFeature && rubroHighlights?.[p.id] ? <FeaturedRubroButton productId={p.id} initial={rubroHighlights[p.id]} compact /> : null}
                </div>
              ) : null}
              {(() => {
                // Cartel comercial (descuento, A pedido, liquidación…) y etiquetas del panel: abajo a la izquierda de la foto.
                const tag = commercialTagFor({
                  commercialTag: p.commercialTag,
                  discountPercent: p.pricing?.discountPercent ?? null,
                  priceOnRequest: priceOnRequest(p),
                });
                if (!tag && p.labels.length === 0) return null;
                return (
                  <div className="pointer-events-none absolute bottom-2 left-2 right-[6.5rem] flex flex-col items-start gap-1">
                    <ProductLabelChips labels={p.labels} size="card" max={2} />
                    {tag ? <CommercialTagBadge tag={tag} size="card" /> : null}
                  </div>
                );
              })()}
              {/* Comparar: abajo a la derecha de la foto, lejos de favoritos/estrella y de la casilla. */}
              <div className="absolute bottom-2 right-2">
                <CompareToggle variant="card" product={{ id: p.id, name: productTitle(p), brand: p.brandName, image: p.primaryImage }} />
              </div>
            </div>

            <div className="flex flex-1 flex-col p-3.5">
              {/* Marca — 1 línea (el modelo va en el título, no se repite) */}
              <p className="flex h-4 items-center truncate text-[11px] uppercase tracking-wider text-muted-foreground">
                {p.brandName || "—"}
              </p>

              {/* Nombre — 2 líneas reservadas */}
              <Link
                href={href}
                title={cardTitle(p)}
                className="mt-1 block h-10 text-sm font-semibold leading-5 line-clamp-2 hover:text-accent"
              >
                {cardTitle(p)}
              </Link>

              {/* Descripción corta — 2 líneas reservadas */}
              <p className="mt-1 h-8 text-xs leading-4 text-muted-foreground line-clamp-2" title={cardDescription(p) ?? undefined}>
                {cardDescription(p) ?? ""}
              </p>

              {/* Etiquetas — 1 fila fija, sin wrap; la que no entra se desvanece en vez de cortarse seca */}
              <div className="mt-2 flex h-6 items-center gap-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]">
                <StockBadge status={p.stockStatus} qty={p.stockQuantity} internal={internal && !publicMode} />
                {/* La serie va antes que el rubro: es lo más específico y la fila corta lo que no entra. */}
                {seriesChipLabel(p) ? <Badge tone="primary">{seriesChipLabel(p)}</Badge> : null}
                {p.categoryName ? <Badge tone="muted">{p.categoryName}</Badge> : null}
                {p.kind === "ACCESORIO" ? <Badge tone="warning">Accesorio</Badge> : null}
                {p.isCustomizable ? (
                  <Badge tone="accent">
                    <Settings2 className="h-3 w-3" /> Configurable
                  </Badge>
                ) : null}
                {p.isCrestronHomeCompatible ? <Badge tone="primary">Crestron Home</Badge> : null}
              </div>

              {/* Precio + acción — siempre al pie, cada uno en su fila */}
              <div className="mt-auto space-y-2 pt-3">
                {publicMode || !p.pricing ? (
                  <Link
                    href={href}
                    className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-secondary"
                  >
                    Ver ficha
                  </Link>
                ) : (
                  <>
                    <div className="flex min-h-10 items-end gap-2">
                      {priceOnRequest(p) ? (
                        <p className="text-lg font-semibold leading-none">Consultá precio</p>
                      ) : (
                        <ProductPrice
                          finalUsd={p.pricing.finalPriceUsd}
                          regularUsd={p.pricing.priceBeforeDiscountUsd}
                          discountPercent={p.pricing.discountPercent}
                          size="card"
                        />
                      )}
                    </div>
                    <AddToDraftButton productId={p.id} productName={p.normalizedName} />
                  </>
                )}
              </div>
            </div>
          </article>
        );
        return publicMode ? (
          <div key={p.id}>{card}</div>
        ) : (
          <SelectableCard key={p.id} productId={p.id}>
            {card}
          </SelectableCard>
        );
      })}
    </div>
  );
}

/** Sin precio cargado: costo 0 o marcado "a consultar". */
export function priceOnRequest(p: Pick<CatalogProduct, "requiresQuote" | "pricing">): boolean {
  return p.requiresQuote || !p.pricing || p.pricing.finalPriceUsd <= 0;
}

/** Título: el modelo (igual en todas las pantallas, ver lib/product-display). */
function cardTitle(p: CatalogProduct): string {
  return productTitle(p);
}

/** Debajo del título: la descripción, sin repetir el modelo. */
function cardDescription(p: CatalogProduct): string | null {
  return productSubtitle(p);
}


/** Se mantiene el import de siempre (lista compartida, ficha, accesorios). */
export { StockBadge };
