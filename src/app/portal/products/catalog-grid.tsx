import { optimizedImage } from "@/lib/image-url";
import { productSubtitle, productTitle } from "@/lib/product-display";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import { FavoriteButton } from "./favorite-button";
import { Settings2 } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { AddToDraftButton } from "./add-to-draft-button";
import { SelectableCard } from "./catalog-multi-select";
import { SHOW_STOCK_TO_CUSTOMERS } from "@/lib/stock-display";

interface GridProps {
  items: CatalogProduct[];
  /** Catálogo público: sin precio, stock, favoritos ni «agregar». */
  publicMode?: boolean;
  /** Base de los links a la ficha (default: portal). */
  basePath?: string;
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
 *  │ USD 1.234,00         │  ← siempre abajo (o "Precio a consultar")
 *  │ [ Agregar ]          │
 *  └──────────────────────┘
 */
export function CatalogGrid({ items, publicMode = false, basePath = "/portal/products" }: GridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                <div className="absolute right-2 top-2">
                  <FavoriteButton productId={p.id} isFavorite={p.isFavorite} />
                </div>
              ) : null}
              {p.pricing && p.pricing.discountPercent > 0 && !priceOnRequest(p) ? (
                <span className="absolute left-2 top-2 rounded-md bg-success px-2 py-0.5 text-[11px] font-semibold text-success-foreground">
                  -{p.pricing.discountPercent.toFixed(0)}%
                </span>
              ) : null}
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

              {/* Etiquetas — 1 fila fija, sin wrap */}
              <div className="mt-2 flex h-6 items-center gap-1 overflow-hidden whitespace-nowrap">
                {!publicMode ? <StockBadge status={p.stockStatus} qty={p.stockQuantity} /> : null}
                {p.categoryName ? <Badge tone="muted">{p.categoryName}</Badge> : null}
                {p.familyName && p.familyName !== p.categoryName ? <Badge tone="muted">{p.familyName}</Badge> : null}
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
                    <div className="flex h-10 items-end justify-between gap-2">
                      {priceOnRequest(p) ? (
                        <p className="text-sm font-semibold leading-none text-muted-foreground">Precio a consultar</p>
                      ) : (
                        <>
                          <p className="text-lg font-semibold leading-none tabular-nums">
                            {formatUsd(p.pricing.finalPriceUsd)}
                          </p>
                          {p.pricing.priceBeforeDiscountUsd && p.pricing.discountPercent > 0 ? (
                            <p className="text-[11px] leading-none text-muted-foreground line-through">
                              {formatUsd(p.pricing.priceBeforeDiscountUsd)}
                            </p>
                          ) : null}
                        </>
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


export function StockBadge({ status, qty }: { status: string; qty: number | null }) {
  if (!SHOW_STOCK_TO_CUSTOMERS) return null;
  if (status === "IN_STOCK") return <Badge tone="success">En stock{qty != null ? ` · ${qty}` : ""}</Badge>;
  if (status === "LOW_STOCK") return <Badge tone="warning">Stock bajo{qty != null ? ` · ${qty}` : ""}</Badge>;
  if (status === "OUT_OF_STOCK") return <Badge tone="destructive">Sin stock</Badge>;
  if (status === "ON_REQUEST") return <Badge tone="accent">Bajo pedido</Badge>;
  return <Badge tone="muted">Consultar</Badge>;
}
