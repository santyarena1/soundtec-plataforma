"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/utils";
import { StockBadge } from "@/app/portal/products/catalog-grid";
import { Search } from "lucide-react";

interface Item {
  id: string;
  name: string;
  sku: string | null;
  shortDescription: string | null;
  brandName: string | null;
  categoryName: string | null;
  stockStatus: string;
  stockQuantity: number | null;
  imageUrl: string | null;
  pricing: {
    finalPriceUsd: number;
    priceBeforeDiscountUsd: number;
    discountPercent: number;
  };
}

interface Props {
  items: Item[];
  showSku: boolean;
  showStock: boolean;
  hidePrices: boolean;
}

export function ShareListTable({ items, showSku, showStock, hidePrices }: Props) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.sku && i.sku.toLowerCase().includes(q)) ||
          (i.brandName && i.brandName.toLowerCase().includes(q)) ||
          (i.categoryName && i.categoryName.toLowerCase().includes(q))
      )
    : items;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Buscar por nombre, SKU, marca o categoría…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          No hay productos que coincidan con la búsqueda.
        </p>
      ) : (
        <>
          {q && (
            <p className="text-xs text-muted-foreground">
              {filtered.length} resultado{filtered.length === 1 ? "" : "s"} para &ldquo;{query}&rdquo;
            </p>
          )}

          {/* Mobile: card list */}
          <div className="divide-y divide-border rounded-lg border border-border sm:hidden">
            {filtered.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                {item.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded bg-white object-contain"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{item.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[item.brandName, item.categoryName].filter(Boolean).join(" · ")}
                  </p>
                  {showSku && item.sku && (
                    <p className="mt-0.5 text-xs text-muted-foreground">SKU: {item.sku}</p>
                  )}
                  {showStock && (
                    <div className="mt-1">
                      <StockBadge status={item.stockStatus} qty={item.stockQuantity} />
                    </div>
                  )}
                </div>
                {!hidePrices && (
                  <div className="shrink-0 text-right">
                    {item.pricing.discountPercent > 0 && (
                      <p className="text-xs text-muted-foreground line-through">
                        {formatUsd(item.pricing.priceBeforeDiscountUsd)}
                      </p>
                    )}
                    <p className="font-semibold">{formatUsd(item.pricing.finalPriceUsd)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  {showSku && <th className="px-3 py-2">SKU</th>}
                  <th className="px-3 py-2">Marca</th>
                  <th className="px-3 py-2">Categoría</th>
                  {showStock && <th className="px-3 py-2">Stock</th>}
                  {!hidePrices && <th className="px-3 py-2 text-right">Precio USD</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-border/80 hover:bg-secondary/30">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {item.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt="" className="h-10 w-10 rounded bg-white object-contain" />
                        )}
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.shortDescription && (
                            <p className="line-clamp-1 text-xs text-muted-foreground">{item.shortDescription}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    {showSku && <td className="px-3 py-2.5 text-muted-foreground">{item.sku || "—"}</td>}
                    <td className="px-3 py-2.5">{item.brandName || "—"}</td>
                    <td className="px-3 py-2.5">{item.categoryName || "—"}</td>
                    {showStock && (
                      <td className="px-3 py-2.5">
                        <StockBadge status={item.stockStatus} qty={item.stockQuantity} />
                      </td>
                    )}
                    {!hidePrices && (
                      <td className="px-3 py-2.5 text-right font-semibold">
                        {item.pricing.discountPercent > 0 && (
                          <span className="mr-2 text-xs font-normal text-muted-foreground line-through">
                            {formatUsd(item.pricing.priceBeforeDiscountUsd)}
                          </span>
                        )}
                        {formatUsd(item.pricing.finalPriceUsd)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
