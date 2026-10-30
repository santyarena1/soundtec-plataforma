"use client";

import Link from "next/link";
import { ChevronRight, Eye, ImageOff, Tag } from "lucide-react";
import { optimizedImage } from "@/lib/image-url";
import { productSubtitle, productTitle, tangoCode } from "@/lib/product-display";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";

export type AdminListRow = {
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
  priceFobUsd: number;
  priceNacFinalArs: number;
  markup: number;
  marginRule: string | null;
  salePriceUsd: number | null;
  stockStatus: string;
  isActive: boolean;
  isCustomizable: boolean;
  isCrestronHomeCompatible: boolean;
  kind: "PRINCIPAL" | "ACCESORIO";
  hasDescription: boolean;
  aiDescriptionFeedbackStatus: string | null;
  openFeedbackCount: number;
};

export type PriceView = "usdFinal" | "usdFob" | "arsNacional";

const STOCK: Record<string, { label: string; tone: "success" | "warning" | "muted" | "accent" }> = {
  IN_STOCK: { label: "En stock", tone: "success" },
  LOW_STOCK: { label: "Poco stock", tone: "warning" },
  OUT_OF_STOCK: { label: "Sin stock", tone: "muted" },
  ON_REQUEST: { label: "A pedido", tone: "accent" },
};

function formatArs(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

/** «Sonido › Amplificadores › Unidades de potencia» → lo último es lo que distingue. */
function splitCategory(path: string | null): { leaf: string; parent: string } | null {
  if (!path) return null;
  const parts = path.split(/\s*›\s*|\s*>\s*/).filter(Boolean);
  if (parts.length === 0) return null;
  return { leaf: parts[parts.length - 1], parent: parts.slice(0, -1).join(" › ") };
}

function priceLabel(row: AdminListRow, view: PriceView): string | null {
  if (view === "usdFob") return row.priceFobUsd > 0 ? formatUsd(row.priceFobUsd) : null;
  if (view === "arsNacional") return row.priceNacFinalArs > 0 ? formatArs(row.priceNacFinalArs) : null;
  return row.priceUsdFinal > 0 ? formatUsd(row.priceUsdFinal) : null;
}

const GRID = "grid grid-cols-[2rem_3.5rem_minmax(0,1fr)] items-center gap-x-3 md:grid-cols-[2rem_3.5rem_minmax(0,1fr)_minmax(0,13rem)_10rem_6.5rem_5.5rem]";

/**
 * Lista del catálogo admin: una fila compacta por producto, pensada para leer
 * rápido muchos productos. Marca y código arriba, modelo en negrita, la parte
 * de la categoría que distingue, y el precio grande con costo y markup debajo.
 */
export function AdminProductList({
  rows,
  showPrices,
  priceView,
  selected,
  onToggle,
  onToggleAll,
  onPreview,
  onEditPrice,
}: {
  rows: AdminListRow[];
  showPrices: boolean;
  priceView: PriceView;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onPreview: (id: string) => void;
  onEditPrice?: (id: string) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <div data-testid="product-list" className="overflow-hidden rounded-lg border border-border bg-card">
      <div
        className={`${GRID} sticky top-0 z-10 border-b border-border bg-secondary/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur`}
      >
        <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Seleccionar todos" className="justify-self-center" />
        <span aria-hidden />

        <span>Producto</span>
        <span className="hidden md:block">Categoría</span>
        <span className="hidden text-right md:block">{showPrices ? "Precio de venta" : ""}</span>
        <span className="hidden md:block">Stock</span>
        <span className="hidden md:block" />
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const isSelected = selected.has(row.id);
          const display = { normalizedName: row.name, originalName: row.originalName, shortDescription: row.shortDescription };
          const subtitle = productSubtitle(display);
          const tango = tangoCode(row.sku);
          const category = splitCategory(row.category);
          const missing = [!row.primaryImage && "foto", !row.category && "categoría", !row.hasDescription && "descripción"].filter(Boolean) as string[];
          const stock = STOCK[row.stockStatus];
          const price = priceLabel(row, priceView);
          return (
            <li
              key={row.id}
              className={`${GRID} group px-3 py-2 transition-colors hover:bg-secondary/40 ${isSelected ? "bg-primary/5" : ""} ${
                row.isActive ? "" : "opacity-70"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(row.id)}
                aria-label={`Seleccionar ${row.name}`}
                className="justify-self-center"
              />

              <Link
                href={`/admin/products/${row.id}`}
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-border bg-white"
                tabIndex={-1}
                aria-hidden
              >
                {row.primaryImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizedImage(row.primaryImage, 96) ?? undefined} alt="" className="h-full w-full object-contain p-1" loading="lazy" decoding="async" />
                ) : (
                  <ImageOff className="h-5 w-5 text-muted-foreground/50" />
                )}
              </Link>

              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {row.brand || "Sin marca"}
                  {tango ? <span className="font-mono normal-case tracking-normal"> · {tango}</span> : null}
                </p>
                <div className="flex min-w-0 items-baseline gap-2">
                  <Link
                    href={`/admin/products/${row.id}`}
                    data-tour="products-open-row"
                    className="truncate text-sm font-semibold text-foreground hover:underline"
                    title={productTitle(display)}
                  >
                    {productTitle(display)}
                  </Link>
                  <span className="flex shrink-0 flex-wrap gap-1">
                    {row.kind === "ACCESORIO" ? <Badge tone="neutral">Accesorio</Badge> : null}
                    {!row.isActive ? <Badge tone="muted">Inactivo</Badge> : null}
                    {row.isCrestronHomeCompatible ? <Badge tone="primary">Crestron Home</Badge> : null}
                    {missing.length ? <Badge tone="warning">Falta {missing.join(", ")}</Badge> : null}
                    {row.aiDescriptionFeedbackStatus === "REJECTED" ? <Badge tone="destructive">Descripción reportada</Badge> : null}
                    {row.openFeedbackCount > 0 ? (
                      <Link href={`/admin/feedback?q=${encodeURIComponent(row.name)}`}>
                        <Badge tone="destructive">Reportes: {row.openFeedbackCount}</Badge>
                      </Link>
                    ) : null}
                  </span>
                </div>
                {subtitle ? <p className="truncate text-xs text-muted-foreground" title={subtitle}>{subtitle}</p> : null}
                {/* En pantallas chicas, categoría y precio van debajo del nombre. */}
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground md:hidden">
                  {category ? <span>{category.leaf}</span> : null}
                  {showPrices ? <span className="font-semibold text-foreground">{price ?? "A consultar"}</span> : null}
                </p>
              </div>

              <div className="hidden min-w-0 md:block" title={row.category ?? undefined}>
                {category ? (
                  <>
                    <p className="truncate text-sm">{category.leaf}</p>
                    {category.parent ? <p className="truncate text-xs text-muted-foreground">{category.parent}</p> : null}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin categoría</span>
                )}
              </div>

              <div className="hidden text-right md:block">
                {showPrices ? (
                  <>
                    <p className={`text-[15px] font-semibold tabular-nums ${price ? "" : "text-muted-foreground"}`}>{price ?? "A consultar"}</p>
                    <p className="truncate text-xs tabular-nums text-muted-foreground" title={row.marginRule ?? "Markup por defecto"}>
                      {row.cost > 0 ? `Costo ${formatUsd(row.cost)}` : "Sin costo"}
                      {row.markup > 0 ? ` · ×${Number(row.markup.toFixed(3))}` : ""}
                    </p>
                    {row.salePriceUsd != null && row.salePriceUsd > 0 ? (
                      <p className="text-[10px] text-muted-foreground">oferta prov. {formatUsd(row.salePriceUsd)}</p>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="hidden md:block">{stock ? <Badge tone={stock.tone}>{stock.label}</Badge> : <span className="text-xs text-muted-foreground">Sin dato</span>}</div>

              <div className="hidden items-center justify-end gap-0.5 md:flex">
                <button
                  type="button"
                  onClick={() => onPreview(row.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Vista rápida"
                  aria-label={`Vista rápida de ${row.name}`}
                >
                  <Eye className="h-4 w-4" />
                </button>
                {onEditPrice ? (
                  <button
                    type="button"
                    onClick={() => onEditPrice(row.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title="Editar precio"
                    aria-label={`Editar precio de ${row.name}`}
                  >
                    <Tag className="h-4 w-4" />
                  </button>
                ) : null}
                <Link
                  href={`/admin/products/${row.id}`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Abrir ficha"
                  aria-label={`Abrir ficha de ${row.name}`}
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
