"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag,
  Plus,
  Minus,
  X,
  Send,
  Loader2,
  Check,
  ArrowRight,
  Wrench,
  Box,
  Sparkles,
} from "lucide-react";
import { formatUsd } from "@/lib/utils";
import { showToast } from "@/components/portal/portal-toaster";
import { addItemsToDraftBundle } from "@/server/actions/requests";

// ────────────────────────────────────────────────────────────────────────────
// Context
// ────────────────────────────────────────────────────────────────────────────

export interface StagedItem {
  productId: string;
  name: string;
  unitPriceUsd: number;
  quantity: number;
  imageUrl: string | null;
  /** Producto principal de esta ficha — siempre presente en el bundle. */
  isMain: boolean;
}

interface BundleContextType {
  mainProductId: string;
  items: StagedItem[];
  subtotal: number;
  totalUnits: number;
  setMainQuantity: (qty: number) => void;
  toggleAccessory: (item: Omit<StagedItem, "isMain" | "quantity">, quantity?: number) => void;
  setAccessoryQuantity: (productId: string, qty: number) => void;
  isStaged: (productId: string) => boolean;
  pending: boolean;
  submit: (notes: string) => Promise<void>;
}

const BundleCtx = createContext<BundleContextType | null>(null);

/** Hook para que cualquier hijo del Provider lea/manipule el bundle. */
export function useProductBundle(): BundleContextType | null {
  return useContext(BundleCtx);
}

// ────────────────────────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────────────────────────

interface ProviderProps {
  mainProduct: {
    id: string;
    name: string;
    unitPriceUsd: number;
    imageUrl: string | null;
  };
  draftRequestId: string;
  children: ReactNode;
}

export function ProductBundleProvider({ mainProduct, draftRequestId, children }: ProviderProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [items, setItems] = useState<StagedItem[]>(() => [
    {
      productId: mainProduct.id,
      name: mainProduct.name,
      unitPriceUsd: mainProduct.unitPriceUsd,
      quantity: 1,
      imageUrl: mainProduct.imageUrl,
      isMain: true,
    },
  ]);

  const setMainQuantity = useCallback(
    (qty: number) => {
      const safe = Math.max(1, Math.min(9999, Math.round(qty)));
      setItems((prev) =>
        prev.map((it) => (it.isMain ? { ...it, quantity: safe } : it))
      );
    },
    []
  );

  const toggleAccessory = useCallback(
    (acc: Omit<StagedItem, "isMain" | "quantity">, quantity: number = 1) => {
      setItems((prev) => {
        const exists = prev.find((it) => it.productId === acc.productId);
        if (exists) {
          // Si ya estaba en el bundle, lo quitamos (toggle off).
          return prev.filter((it) => it.productId !== acc.productId);
        }
        return [
          ...prev,
          { ...acc, quantity: Math.max(1, quantity), isMain: false },
        ];
      });
    },
    []
  );

  const setAccessoryQuantity = useCallback((productId: string, qty: number) => {
    const safe = Math.max(1, Math.min(9999, Math.round(qty)));
    setItems((prev) =>
      prev.map((it) => (it.productId === productId ? { ...it, quantity: safe } : it))
    );
  }, []);

  const isStaged = useCallback(
    (productId: string) => items.some((it) => it.productId === productId),
    [items]
  );

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + it.unitPriceUsd * it.quantity, 0),
    [items]
  );
  const totalUnits = useMemo(
    () => items.reduce((acc, it) => acc + it.quantity, 0),
    [items]
  );

  const submit = useCallback(
    (notes: string) => {
      return new Promise<void>((resolve) => {
        start(async () => {
          try {
            const payload = items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              userNotes: it.isMain && notes.trim() ? notes.trim() : null,
            }));
            const r = await addItemsToDraftBundle({
              items: payload,
              primaryProductId: mainProduct.id,
            });
            if (!r.ok) {
              showToast({
                type: "error",
                title: "No se pudo agregar",
                description: r.error || "Reintentá en unos segundos.",
              });
              resolve();
              return;
            }
            showToast({
              type: "success",
              title: `Agregaste ${items.length} producto${items.length === 1 ? "" : "s"} a tu solicitud`,
              description: `Total: ${totalUnits} unidades por ${formatUsd(subtotal)} estimado.`,
              requestId: r.requestId,
              itemsTotal: r.itemsTotal,
              unitsTotal: r.unitsTotal,
            });
            // Resetear bundle al estado inicial (main qty=1, sin accesorios)
            setItems([
              {
                productId: mainProduct.id,
                name: mainProduct.name,
                unitPriceUsd: mainProduct.unitPriceUsd,
                quantity: 1,
                imageUrl: mainProduct.imageUrl,
                isMain: true,
              },
            ]);
            router.refresh();
          } catch {
            showToast({
              type: "error",
              title: "Error inesperado",
              description: "Reintentá en unos segundos.",
            });
          } finally {
            resolve();
          }
        });
      });
    },
    [items, mainProduct, router, subtotal, totalUnits]
  );

  void draftRequestId; // mantenido en props para compatibilidad futura

  return (
    <BundleCtx.Provider
      value={{
        mainProductId: mainProduct.id,
        items,
        subtotal,
        totalUnits,
        setMainQuantity,
        toggleAccessory,
        setAccessoryQuantity,
        isStaged,
        pending,
        submit,
      }}
    >
      {children}
    </BundleCtx.Provider>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Bundle staging panel — reemplaza al AddToRequestPanel cuando hay provider
// ────────────────────────────────────────────────────────────────────────────

interface BundlePanelProps {
  /** Cantidad de productos ya cargados en el draft (para mostrar contexto). */
  draftItemCount: number;
  draftRequestId: string;
}

export function BundleStagingPanel({ draftItemCount, draftRequestId }: BundlePanelProps) {
  const ctx = useProductBundle();
  const [notes, setNotes] = useState("");

  if (!ctx) return null;

  const mainItem = ctx.items.find((it) => it.isMain);
  const accessories = ctx.items.filter((it) => !it.isMain);
  const hasAccessories = accessories.length > 0;

  function inc(productId: string, current: number) {
    if (productId === ctx?.mainProductId) ctx.setMainQuantity(current + 1);
    else ctx?.setAccessoryQuantity(productId, current + 1);
  }
  function dec(productId: string, current: number) {
    const next = Math.max(1, current - 1);
    if (productId === ctx?.mainProductId) ctx.setMainQuantity(next);
    else ctx?.setAccessoryQuantity(productId, next);
  }

  return (
    <Card className="overflow-hidden border-primary/30 shadow-md">
      <div className="border-b border-border bg-gradient-to-r from-primary/10 to-transparent px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Armado para tu solicitud
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sumá accesorios desde abajo y enviá todo junto.{" "}
              <Link href={`/portal/requests/${draftRequestId}`} className="underline hover:text-foreground">
                Tu solicitud ya tiene {draftItemCount} producto{draftItemCount === 1 ? "" : "s"}
              </Link>
            </p>
          </div>
        </div>
      </div>

      <CardContent className="space-y-4 p-5">
        {/* Lista de items */}
        <ul className="space-y-2">
          {/* Producto principal — siempre primero */}
          {mainItem ? (
            <li className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 p-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-card">
                {mainItem.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mainItem.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Box className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{mainItem.name}</p>
                    <Badge tone="primary" className="mt-0.5">Producto principal</Badge>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-right">
                    {formatUsd(mainItem.unitPriceUsd * mainItem.quantity)}
                  </p>
                </div>
                <QtyControl
                  qty={mainItem.quantity}
                  onMinus={() => dec(mainItem.productId, mainItem.quantity)}
                  onPlus={() => inc(mainItem.productId, mainItem.quantity)}
                  disabled={ctx.pending}
                />
              </div>
            </li>
          ) : null}

          {/* Accesorios staged */}
          {accessories.map((it) => (
            <li
              key={it.productId}
              className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/5 p-3 animate-in fade-in slide-in-from-top-1 duration-200"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-card">
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Wrench className="h-4 w-4 text-warning" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{it.name}</p>
                    <Badge tone="warning" className="mt-0.5">
                      <Wrench className="h-2.5 w-2.5" /> Accesorio
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-right">
                    {formatUsd(it.unitPriceUsd * it.quantity)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <QtyControl
                    qty={it.quantity}
                    onMinus={() => dec(it.productId, it.quantity)}
                    onPlus={() => inc(it.productId, it.quantity)}
                    disabled={ctx.pending}
                  />
                  <button
                    type="button"
                    onClick={() => ctx.toggleAccessory(it)}
                    disabled={ctx.pending}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 disabled:opacity-50"
                    title="Quitar del armado"
                  >
                    <X className="h-3 w-3" />
                    Quitar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Hint si no hay accesorios staged */}
        {!hasAccessories ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
            <span>
              Si abajo hay accesorios compatibles, hacé click en <strong>«Sumar al armado»</strong> y aparecen acá.
            </span>
          </div>
        ) : null}

        {/* Subtotal del bundle */}
        <div className="rounded-md border border-border bg-secondary/40 p-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {ctx.items.length} producto{ctx.items.length === 1 ? "" : "s"} ·{" "}
                {ctx.totalUnits} u.
              </span>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Subtotal del armado
              </p>
              <p className="text-xl font-bold tabular-nums text-success">
                {formatUsd(ctx.subtotal)}
              </p>
            </div>
          </div>
        </div>

        {/* Notas opcionales */}
        <div>
          <Label htmlFor="bundle-notes">Notas para Soundtec (opcional)</Label>
          <Textarea
            id="bundle-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Plazos, características, ambiente, etc."
          />
        </div>

        {/* CTA principal */}
        <Button
          type="button"
          onClick={() => ctx.submit(notes).then(() => setNotes(""))}
          disabled={ctx.pending || ctx.items.length === 0}
          className="w-full"
          size="lg"
        >
          {ctx.pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Agregar todo a mi solicitud
          {ctx.items.length > 1 ? (
            <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-foreground/20 px-1.5 text-[11px] font-bold tabular-nums">
              {ctx.items.length}
            </span>
          ) : null}
        </Button>

        <Link
          href={`/portal/requests/${draftRequestId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Ver mi solicitud completa <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Botón "Sumar al armado" para accesorios — context-aware
// ────────────────────────────────────────────────────────────────────────────

interface BundleAccessoryButtonProps {
  productId: string;
  productName: string;
  unitPriceUsd: number;
  imageUrl: string | null;
  compact?: boolean;
}

export function BundleAddAccessoryButton({
  productId,
  productName,
  unitPriceUsd,
  imageUrl,
  compact = false,
}: BundleAccessoryButtonProps) {
  const ctx = useProductBundle();
  if (!ctx) return null;
  const staged = ctx.isStaged(productId);

  return (
    <button
      type="button"
      onClick={() =>
        ctx.toggleAccessory({
          productId,
          name: productName,
          unitPriceUsd,
          imageUrl,
        })
      }
      disabled={ctx.pending}
      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border font-medium transition-all ${
        staged
          ? "border-success bg-success/10 text-success hover:bg-success/20"
          : "border-primary/30 bg-primary text-primary-foreground hover:bg-primary/90"
      } disabled:opacity-60 ${compact ? "h-8 px-2 text-xs" : "h-10 px-4 text-sm"}`}
    >
      {staged ? (
        <>
          <Check className={compact ? "h-3 w-3" : "h-4 w-4"} />
          En el armado · Quitar
        </>
      ) : (
        <>
          <Plus className={compact ? "h-3 w-3" : "h-4 w-4"} />
          {compact ? "Sumar" : "Sumar al armado"}
        </>
      )}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pequeño widget de cantidad reutilizable
// ────────────────────────────────────────────────────────────────────────────

function QtyControl({
  qty,
  onMinus,
  onPlus,
  disabled,
}: {
  qty: number;
  onMinus: () => void;
  onPlus: () => void;
  disabled: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={onMinus}
        disabled={disabled || qty <= 1}
        className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-secondary disabled:opacity-40"
        aria-label="Disminuir"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[2rem] px-1 text-center text-sm font-semibold tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        onClick={onPlus}
        disabled={disabled}
        className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-secondary disabled:opacity-40"
        aria-label="Aumentar"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
