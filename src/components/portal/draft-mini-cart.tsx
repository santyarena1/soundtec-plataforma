"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingBag, ChevronRight, Send, Box, X, Wrench } from "lucide-react";
import { formatUsd } from "@/lib/utils";

interface RecentItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceUsd: number;
  imageUrl: string | null;
  isAccessory: boolean;
}

interface Props {
  draft: {
    id: string;
    itemCount: number;
    unitCount: number;
    subtotalUsd: number;
    recentItems: RecentItem[];
  } | null;
}

/**
 * Botón flotante bottom-right SIEMPRE visible en todas las páginas del portal.
 *
 * - Muestra contador de items + unidades + subtotal estimado.
 * - Click abre un panel con preview de los últimos productos agregados y CTAs
 *   "Ir a mi solicitud" y "Seguir agregando productos".
 * - Si no hay borrador activo, no se renderiza.
 *
 * Se actualiza con cada router.refresh() porque su padre es server component.
 */
export function DraftMiniCart({ draft }: Props) {
  const [open, setOpen] = useState(false);

  if (!draft || draft.itemCount === 0) {
    return (
      <div className="fixed bottom-[max(4.75rem,calc(env(safe-area-inset-bottom)+4.25rem))] right-[max(0.75rem,env(safe-area-inset-right))] z-50 md:bottom-6 md:right-6">
        <Link
          href="/portal/products"
          className="group flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2.5 text-sm font-medium text-muted-foreground shadow-lg transition-colors hover:bg-secondary hover:text-foreground sm:px-4 sm:py-3"
        >
          <ShoppingBag className="h-4 w-4" />
          <span className="hidden sm:inline">Sin solicitud activa</span>
          <span className="sm:hidden">Catálogo</span>
          <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>
    );
  }

  const accessoryUnits = draft.recentItems
    .filter((r) => r.isAccessory)
    .reduce((acc, r) => acc + r.quantity, 0);
  const hasMore = draft.itemCount > draft.recentItems.length;

  return (
    <>
      {/* Backdrop cuando está abierto (mobile) */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm sm:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="fixed bottom-[max(4.75rem,calc(env(safe-area-inset-bottom)+4.25rem))] right-[max(0.75rem,env(safe-area-inset-right))] z-50 md:bottom-6 md:right-6">
        {/* Panel expandible */}
        {open ? (
          <div className="mb-3 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/10 to-transparent px-4 py-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Tu solicitud en armado</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 border-b border-border bg-secondary/30 px-4 py-3 text-center">
              <div>
                <p className="text-lg font-semibold tabular-nums">{draft.itemCount}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  producto{draft.itemCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="border-x border-border">
                <p className="text-lg font-semibold tabular-nums">{draft.unitCount}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">unidades</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums text-success">
                  {formatUsd(draft.subtotalUsd)}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">subtotal</p>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">
                Últimos agregados
              </p>
              {draft.recentItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/portal/products/${item.productId}`}
                  className="flex items-center gap-3 rounded-md border border-border bg-secondary/40 p-2 hover:bg-secondary transition-colors"
                  onClick={() => setOpen(false)}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-card border border-border">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Box className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span>
                        × {item.quantity} · {formatUsd(item.unitPriceUsd * item.quantity)}
                      </span>
                      {item.isAccessory ? (
                        <span className="inline-flex items-center gap-0.5 rounded-sm bg-warning/10 px-1 py-0.5 text-[9px] uppercase text-warning">
                          <Wrench className="h-2.5 w-2.5" /> acc
                        </span>
                      ) : null}
                    </p>
                  </div>
                </Link>
              ))}
              {hasMore ? (
                <p className="text-center text-[11px] text-muted-foreground">
                  +{draft.itemCount - draft.recentItems.length} producto(s) más…
                </p>
              ) : null}
              {accessoryUnits > 0 ? (
                <p className="border-t border-border pt-2 text-[11px] text-muted-foreground text-center">
                  <Wrench className="inline h-3 w-3 mr-0.5 text-warning" />
                  {accessoryUnits} accesorio{accessoryUnits === 1 ? "" : "s"} en tu solicitud
                </p>
              ) : null}
            </div>

            <div className="border-t border-border bg-card px-3 py-3 space-y-2">
              <Link
                href={`/portal/requests/${draft.id}`}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={() => setOpen(false)}
              >
                <Send className="h-3.5 w-3.5" />
                Ver y enviar mi solicitud
              </Link>
              <Link
                href="/portal/products"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                Seguir agregando productos
              </Link>
            </div>
          </div>
        ) : null}

        {/* Pill flotante */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-2 rounded-full border border-primary/40 bg-card pl-3 pr-4 py-2.5 text-sm font-medium shadow-xl transition-all hover:scale-105 ${
            open ? "ring-2 ring-primary/30" : ""
          }`}
          aria-label="Ver mi solicitud"
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShoppingBag className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-card bg-accent px-1 text-[10px] font-bold text-accent-foreground tabular-nums">
              {draft.unitCount > 99 ? "99+" : draft.unitCount}
            </span>
          </span>
          <div className="text-left leading-tight">
            <p className="text-foreground">
              {draft.itemCount} producto{draft.itemCount === 1 ? "" : "s"}
            </p>
            <p className="text-[11px] text-success tabular-nums">{formatUsd(draft.subtotalUsd)}</p>
          </div>
        </button>
      </div>
    </>
  );
}
