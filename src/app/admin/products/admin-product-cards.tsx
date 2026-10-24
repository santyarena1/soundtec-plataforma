"use client";

import { optimizedImage } from "@/lib/image-url";
import { productSubtitle, productTitle, tangoCode } from "@/lib/product-display";
import Link from "next/link";
import { ImageOff, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";

export type AdminCardRow = {
  id: string;
  sku: string;
  name: string;
  originalName: string;
  shortDescription: string | null;
  primaryImage: string | null;
  brand: string | null;
  category: string | null;
  cost: number;
  priceUsdFinal: number;
  markup: number;
  marginRule: string | null;
  stockStatus: string;
  isActive: boolean;
  kind: "PRINCIPAL" | "ACCESORIO";
  hasDescription: boolean;
};

const STOCK: Record<string, { label: string; tone: "success" | "warning" | "muted" | "accent" }> = {
  IN_STOCK: { label: "En stock", tone: "success" },
  LOW_STOCK: { label: "Poco stock", tone: "warning" },
  OUT_OF_STOCK: { label: "Sin stock", tone: "muted" },
  ON_REQUEST: { label: "A pedido", tone: "accent" },
};

/**
 * Vista de tarjetas del catálogo admin: misma lectura que el catálogo de
 * cliente (foto, marca · código, nombre) más la capa admin (costo → precio,
 * markup y regla, y qué datos le faltan).
 */
export function AdminProductCards({
  rows,
  showPrices,
  selected,
  onToggle,
  onEditPrice,
}: {
  rows: AdminCardRow[];
  showPrices: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onEditPrice?: (id: string) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {rows.map((row) => {
        const isSelected = selected.has(row.id);
        const missing = [!row.primaryImage && "foto", !row.category && "categoría", !row.hasDescription && "descripción"].filter(Boolean) as string[];
        const stock = STOCK[row.stockStatus];
        const display = { normalizedName: row.name, originalName: row.originalName, shortDescription: row.shortDescription };
        const title = productTitle(display);
        const subtitle = productSubtitle(display);
        const tango = tangoCode(row.sku);
        return (
          <li
            key={row.id}
            className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md ${
              isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"
            } ${row.isActive ? "" : "opacity-75"}`}
          >
            <label className="absolute left-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-card/90">
              <input type="checkbox" checked={isSelected} onChange={() => onToggle(row.id)} aria-label={`Seleccionar ${row.name}`} />
            </label>
            <Link href={`/admin/products/${row.id}`} className="flex h-40 items-center justify-center bg-white p-4">
              {row.primaryImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={optimizedImage(row.primaryImage, 384) ?? undefined} alt={row.name} className="max-h-full max-w-full object-contain" loading="lazy" decoding="async" />
              ) : (
                <ImageOff className="h-8 w-8 text-muted-foreground/50" aria-hidden />
              )}
            </Link>
            <div className="flex flex-1 flex-col gap-2 border-t border-border p-3">
              <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {row.brand || "Sin marca"}
                {tango ? <span className="normal-case tracking-normal"> · Tango {tango}</span> : null}
              </p>
              <Link href={`/admin/products/${row.id}`} className="line-clamp-1 text-sm font-semibold leading-snug hover:underline">
                {title}
              </Link>
              {subtitle ? <p className="-mt-1 line-clamp-2 text-xs text-muted-foreground">{subtitle}</p> : null}
              <div className="flex flex-wrap gap-1">
                {!row.isActive ? <Badge tone="muted">Inactivo</Badge> : null}
                {row.kind === "ACCESORIO" ? <Badge tone="neutral">Accesorio</Badge> : null}
                {stock ? <Badge tone={stock.tone}>{stock.label}</Badge> : null}
                {missing.length ? <Badge tone="warning">Falta {missing.join(", ")}</Badge> : null}
              </div>
              {showPrices ? (
                <div className="mt-auto space-y-1 border-t border-border pt-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Costo {row.cost > 0 ? formatUsd(row.cost) : "—"}</span>
                    <span className="text-base font-semibold tabular-nums">{row.priceUsdFinal > 0 ? formatUsd(row.priceUsdFinal) : "A consultar"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground" title={row.marginRule ?? undefined}>
                      {row.markup > 0 ? `×${Number(row.markup.toFixed(3))}` : ""} {row.marginRule ?? "markup por defecto"}
                    </span>
                    {onEditPrice ? (
                      <button
                        type="button"
                        onClick={() => onEditPrice(row.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        <Tag className="h-3 w-3" /> Precio
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
