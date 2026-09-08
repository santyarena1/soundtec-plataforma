import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import { FavoriteButton } from "./favorite-button";
import { Settings2 } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { AddToDraftButton } from "./add-to-draft-button";
import { SelectableCard } from "./catalog-multi-select";

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
 *  │ [stock] [tag]        │  ← 1 fila, sin wrap
 *  │ USD 1.234,00   [ + ] │  ← siempre abajo
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
                      src={p.primaryImage}
                      alt={p.normalizedName}
                      className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
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
              {p.pricing && p.pricing.discountPercent > 0 ? (
                <span className="absolute left-2 top-2 rounded-md bg-success px-2 py-0.5 text-[11px] font-semibold text-success-foreground">
                  -{p.pricing.discountPercent.toFixed(0)}%
                </span>
              ) : null}
            </div>

            <div className="flex flex-1 flex-col p-3.5">
              {/* Marca · SKU — 1 línea */}
              <p className="flex h-4 items-center gap-1.5 truncate text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="truncate">{p.brandName || "—"}</span>
                {p.internalSku ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="shrink-0 normal-case tracking-normal">{p.internalSku}</span>
                  </>
                ) : null}
              </p>

              {/* Nombre — 2 líneas reservadas */}
              <Link
                href={href}
                title={p.normalizedName}
                className="mt-1 block h-10 text-sm font-semibold leading-5 line-clamp-2 hover:text-accent"
              >
                {p.normalizedName}
              </Link>

              {/* Etiquetas — 1 fila fija, sin wrap */}
              <div className="mt-2 flex h-6 items-center gap-1 overflow-hidden whitespace-nowrap">
                {!publicMode ? <StockBadge status={p.stockStatus} qty={p.stockQuantity} /> : null}
                {p.kind === "ACCESORIO" ? <Badge tone="warning">Accesorio</Badge> : null}
                {p.isCustomizable ? (
                  <Badge tone="accent">
                    <Settings2 className="h-3 w-3" /> Configurable
                  </Badge>
                ) : null}
                {p.isCrestronHomeCompatible ? <Badge tone="primary">Crestron Home</Badge> : null}
                {publicMode && p.categoryName ? <Badge tone="muted">{p.categoryName}</Badge> : null}
              </div>

              {/* Precio + acción — siempre al pie */}
              <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                {publicMode || !p.pricing ? (
                  <Link
                    href={href}
                    className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-secondary"
                  >
                    Ver ficha
                  </Link>
                ) : (
                  <>
                    <div className="min-w-0">
                      {p.pricing.priceBeforeDiscountUsd && p.pricing.discountPercent > 0 ? (
                        <p className="text-[11px] leading-none text-muted-foreground line-through">
                          {formatUsd(p.pricing.priceBeforeDiscountUsd)}
                        </p>
                      ) : (
                        <p className="text-[11px] leading-none text-muted-foreground">Precio USD</p>
                      )}
                      <p className="mt-1 truncate text-lg font-semibold leading-none tabular-nums">
                        {formatUsd(p.pricing.finalPriceUsd)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <AddToDraftButton productId={p.id} productName={p.normalizedName} compact />
                    </div>
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

export function StockBadge({ status, qty }: { status: string; qty: number | null }) {
  if (status === "IN_STOCK") return <Badge tone="success">En stock{qty != null ? ` · ${qty}` : ""}</Badge>;
  if (status === "LOW_STOCK") return <Badge tone="warning">Stock bajo{qty != null ? ` · ${qty}` : ""}</Badge>;
  if (status === "OUT_OF_STOCK") return <Badge tone="destructive">Sin stock</Badge>;
  if (status === "ON_REQUEST") return <Badge tone="accent">Bajo pedido</Badge>;
  return <Badge tone="muted">Consultar</Badge>;
}
