import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import { FavoriteButton } from "./favorite-button";
import { Settings2 } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { AddToDraftButton } from "./add-to-draft-button";
import { SelectableCard } from "./catalog-multi-select";

export function CatalogGrid({ items }: { items: CatalogProduct[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((p) => (
        <SelectableCard key={p.id} productId={p.id}>
        <Card className="group flex flex-col overflow-hidden transition-shadow hover:shadow-elevated">
          <Link href={`/portal/products/${p.id}`} className="block">
            <div className="aspect-[4/3] w-full overflow-hidden bg-white">
              {p.primaryImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.primaryImage}
                  alt={p.normalizedName}
                  className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sin imagen</div>
              )}
            </div>
          </Link>

          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{p.brandName || "—"}</p>
                <Link
                  href={`/portal/products/${p.id}`}
                  className="line-clamp-2 text-sm font-semibold leading-tight hover:underline"
                >
                  {p.normalizedName}
                </Link>
              </div>
              <FavoriteButton productId={p.id} isFavorite={p.isFavorite} />
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <StockBadge status={p.stockStatus} qty={p.stockQuantity} />
              {p.pricing.discountPercent > 0 ? (
                <Badge tone="success">-{p.pricing.discountPercent.toFixed(1)}%</Badge>
              ) : null}
              {p.isCustomizable ? (
                <Badge tone="accent">
                  <Settings2 className="h-3 w-3" /> Configurable
                </Badge>
              ) : null}
              {p.kind === "ACCESORIO" ? <Badge tone="warning">Accesorio</Badge> : null}
            </div>

            <div className="mt-auto space-y-1">
              {p.pricing.priceBeforeDiscountUsd && p.pricing.discountPercent > 0 ? (
                <p className="text-xs text-muted-foreground line-through">
                  {formatUsd(p.pricing.priceBeforeDiscountUsd)}
                </p>
              ) : null}
              <p className="text-lg font-semibold text-foreground">{formatUsd(p.pricing.finalPriceUsd)}</p>
            </div>
            <AddToDraftButton productId={p.id} productName={p.normalizedName} />
          </div>
        </Card>
        </SelectableCard>
      ))}
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
