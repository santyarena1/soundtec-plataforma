import Link from "next/link";
import { Card } from "@/components/ui/card";
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

export function CatalogGrid({ items, publicMode = false, basePath = "/portal/products" }: GridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((p) => {
        const card = (
          <Card className="group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-elevated">
            <div className="relative">
              <Link href={`${basePath}/${p.id}`} className="block">
                <div className="aspect-[4/3] w-full overflow-hidden bg-white">
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
            </div>

            <div className="flex flex-1 flex-col gap-3 p-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{p.brandName || "—"}</p>
                <Link
                  href={`${basePath}/${p.id}`}
                  title={p.normalizedName}
                  className="mt-0.5 block min-h-[3.75rem] w-full text-sm font-semibold leading-5 line-clamp-3 hover:underline"
                >
                  {p.normalizedName}
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {!publicMode ? <StockBadge status={p.stockStatus} qty={p.stockQuantity} /> : null}
                {p.pricing && p.pricing.discountPercent > 0 ? (
                  <Badge tone="success">-{p.pricing.discountPercent.toFixed(1)}%</Badge>
                ) : null}
                {p.isCustomizable ? (
                  <Badge tone="accent">
                    <Settings2 className="h-3 w-3" /> Configurable
                  </Badge>
                ) : null}
                {p.kind === "ACCESORIO" ? <Badge tone="warning">Accesorio</Badge> : null}
                {p.isCrestronHomeCompatible ? <Badge tone="primary">Crestron Home</Badge> : null}
                {publicMode && p.categoryName ? <Badge tone="muted">{p.categoryName}</Badge> : null}
              </div>

              {publicMode || !p.pricing ? (
                <div className="mt-auto">
                  <Link
                    href={`${basePath}/${p.id}`}
                    className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-secondary"
                  >
                    Ver ficha
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mt-auto space-y-1">
                    {p.pricing.priceBeforeDiscountUsd && p.pricing.discountPercent > 0 ? (
                      <p className="text-xs text-muted-foreground line-through">
                        {formatUsd(p.pricing.priceBeforeDiscountUsd)}
                      </p>
                    ) : null}
                    <p className="text-lg font-semibold text-foreground">{formatUsd(p.pricing.finalPriceUsd)}</p>
                  </div>
                  <AddToDraftButton productId={p.id} productName={p.normalizedName} />
                </>
              )}
            </div>
          </Card>
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
