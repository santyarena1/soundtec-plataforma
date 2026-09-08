import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatUsd } from "@/lib/utils";
import { FavoriteButton } from "./favorite-button";
import { StockBadge } from "./catalog-grid";
import { Badge } from "@/components/ui/badge";
import type { CatalogProduct } from "@/lib/catalog";
import { AddToDraftButton } from "./add-to-draft-button";

interface TableProps {
  items: CatalogProduct[];
  publicMode?: boolean;
  basePath?: string;
}

export function CatalogTable({ items, publicMode = false, basePath = "/portal/products" }: TableProps) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Producto</TH>
          <TH>Marca</TH>
          <TH>Categoría</TH>
          {!publicMode ? <TH>Stock</TH> : null}
          {!publicMode ? <TH className="text-right">Precio USD</TH> : null}
          <TH className="text-right">{publicMode ? "" : "Acciones"}</TH>
        </TR>
      </THead>
      <TBody>
        {items.map((p) => (
          <TR key={p.id}>
            <TD>
              <Link href={`${basePath}/${p.id}`} className="flex items-center gap-3 hover:text-accent">
                <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white">
                  {p.primaryImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.primaryImage} alt={p.normalizedName} className="h-full w-full object-contain" loading="lazy" />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-sm font-medium">{p.normalizedName}</span>
                  <span className="block text-xs text-muted-foreground">{p.internalSku || "—"}</span>
                </span>
              </Link>
            </TD>
            <TD>{p.brandName || "—"}</TD>
            <TD>{p.categoryName || "—"}</TD>
            {!publicMode ? (
              <TD>
                <StockBadge status={p.stockStatus} qty={p.stockQuantity} />
              </TD>
            ) : null}
            {!publicMode ? (
              <TD className="text-right">
                {p.pricing ? (
                  <div className="flex flex-col items-end">
                    {p.pricing.priceBeforeDiscountUsd && p.pricing.discountPercent > 0 ? (
                      <span className="text-xs text-muted-foreground line-through">
                        {formatUsd(p.pricing.priceBeforeDiscountUsd)}
                      </span>
                    ) : null}
                    <span className="font-semibold">{formatUsd(p.pricing.finalPriceUsd)}</span>
                    {p.pricing.discountPercent > 0 ? (
                      <Badge tone="success" className="mt-0.5">
                        -{p.pricing.discountPercent.toFixed(1)}%
                      </Badge>
                    ) : null}
                  </div>
                ) : (
                  "—"
                )}
              </TD>
            ) : null}
            <TD className="text-right">
              {publicMode ? (
                <Link href={`${basePath}/${p.id}`} className="text-sm font-medium text-accent hover:underline">
                  Ver ficha
                </Link>
              ) : (
                <div className="flex justify-end gap-2">
                  <AddToDraftButton productId={p.id} productName={p.normalizedName} compact />
                  <FavoriteButton productId={p.id} isFavorite={p.isFavorite} />
                </div>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
