import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatUsd } from "@/lib/utils";
import { FavoriteButton } from "./favorite-button";
import { StockBadge } from "./catalog-grid";
import { Badge } from "@/components/ui/badge";
import type { CatalogProduct } from "@/lib/catalog";
import { AddToDraftButton } from "./add-to-draft-button";

export function CatalogTable({ items }: { items: CatalogProduct[] }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Producto</TH>
          <TH>Marca</TH>
          <TH>Categoría</TH>
          <TH>Stock</TH>
          <TH className="text-right">Precio USD</TH>
          <TH>Acciones</TH>
        </TR>
      </THead>
      <TBody>
        {items.map((p) => (
          <TR key={p.id}>
            <TD>
              <Link href={`/portal/products/${p.id}`} className="flex items-center gap-3 hover:text-accent">
                <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-md bg-secondary">
                  {p.primaryImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.primaryImage} alt={p.normalizedName} className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span>
                  <span className="block text-sm font-medium">{p.normalizedName}</span>
                  <span className="block text-xs text-muted-foreground">{p.internalSku || "—"}</span>
                </span>
              </Link>
            </TD>
            <TD>{p.brandName || "—"}</TD>
            <TD>{p.categoryName || "—"}</TD>
            <TD><StockBadge status={p.stockStatus} qty={p.stockQuantity} /></TD>
            <TD className="text-right">
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
            </TD>
            <TD className="text-right">
              <div className="flex justify-end gap-2">
                <AddToDraftButton productId={p.id} productName={p.normalizedName} compact />
                <FavoriteButton productId={p.id} isFavorite={p.isFavorite} />
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
