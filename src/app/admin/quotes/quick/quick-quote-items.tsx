"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils";
import { tangoCode } from "@/lib/product-display";

export type QuickItem = {
  /** Id de la línea: el mismo producto puede ir en varias líneas (ej. uno sin cargo y otro cobrado). */
  uid: string;
  productId: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitPriceUsd: number;
  discountPercent: number;
  note: string;
  included: boolean;
  /** Ítem libre: escrito a mano, sin producto del catálogo. */
  free?: boolean;
  /** Detalle debajo del nombre (ej. el de un servicio): sale completo en el PDF. */
  detail?: string;
  /** Descripción corta debajo del modelo. */
  subtitle?: string | null;
  /** IVA de la ficha; null = el IVA por defecto de cotizaciones. */
  ivaPercent: number | null;
  /** Línea «incluida sin cargo» que viene con otra: sigue su cantidad. */
  parentUid?: string;
  /** Unidades incluidas por cada unidad del producto principal. */
  perParent?: number;
};

export type TaxMode = "NOTE" | "NONE" | "ADDED";

export const lineTotal = (item: QuickItem) => (item.included ? 0 : item.quantity * item.unitPriceUsd * (1 - item.discountPercent / 100));

/** Cambia la cantidad de una línea y arrastra las que vienen incluidas con ella. */
export function withQuantity(items: QuickItem[], uid: string, quantity: number): QuickItem[] {
  return items.map((item) => {
    if (item.uid === uid) return { ...item, quantity };
    if (item.parentUid === uid) return { ...item, quantity: quantity * (item.perParent ?? 1) };
    return item;
  });
}

export function QuickQuoteItems({
  items,
  onChange,
  taxMode,
  defaultIva,
}: {
  items: QuickItem[];
  onChange: (items: QuickItem[]) => void;
  taxMode: TaxMode;
  defaultIva: number;
}) {
  const update = (uid: string, patch: Partial<QuickItem>) => onChange(items.map((item) => (item.uid === uid ? { ...item, ...patch } : item)));
  const remove = (uid: string) => onChange(items.filter((item) => item.uid !== uid && item.parentUid !== uid));
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  // IVA por línea: el de la ficha del producto o el de cotizaciones (Configuración).
  const ivaByRate = new Map<number, number>();
  for (const item of items) {
    const rate = item.ivaPercent ?? defaultIva;
    ivaByRate.set(rate, (ivaByRate.get(rate) ?? 0) + (lineTotal(item) * rate) / 100);
  }
  const iva = [...ivaByRate.values()].reduce((a, b) => a + b, 0);

  if (!items.length)
    return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Buscá productos o agregá un ítem libre para empezar.</p>;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-secondary text-xs text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Producto</th>
              <th className="p-2 text-left">Cant.</th>
              <th className="p-2 text-left">Precio unit. USD</th>
              <th className="p-2 text-left">Desc. %</th>
              <th className="p-2 text-right">Total línea</th>
              <th className="p-2 text-left">Nota</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.uid} className={`border-t ${item.parentUid ? "bg-secondary/30" : ""}`}>
                <td className={`p-2 ${item.parentUid ? "pl-6" : ""}`}>
                  {item.free ? (
                    <>
                    <Input
                      value={item.name}
                      onChange={(e) => update(item.uid, { name: e.target.value })}
                      placeholder="Qué es (ej. Mano de obra de instalación, Cable por metro)"
                      aria-label="Descripción del ítem libre"
                      className="min-w-[16rem]"
                    />
                    {item.detail !== undefined && item.detail !== "" ? (
                      <textarea
                        value={item.detail}
                        onChange={(e) => update(item.uid, { detail: e.target.value })}
                        rows={2}
                        aria-label="Detalle del ítem"
                        className="mt-1 w-full min-w-[16rem] rounded-md border border-border bg-background px-2 py-1 text-xs"
                      />
                    ) : null}
                    </>
                  ) : (
                    <p className="font-medium">{item.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {item.free ? (item.detail ? "Servicio · " : "Ítem libre · ") : ""}
                    {[tangoCode(item.sku) ? `Tango ${tangoCode(item.sku)}` : null, item.included ? "Incluido sin cargo" : item.subtitle].filter(Boolean).join(" · ")}
                    {item.parentUid ? ` · ${item.perParent ?? 1} por unidad` : ""}
                  </p>
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={item.quantity}
                    disabled={!!item.parentUid}
                    title={item.parentUid ? "Sigue la cantidad del producto con el que viene incluido" : undefined}
                    onChange={(e) => onChange(withQuantity(items, item.uid, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                    className="w-20"
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPriceUsd}
                    disabled={item.included}
                    onChange={(e) => update(item.uid, { unitPriceUsd: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-28"
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={item.discountPercent}
                    disabled={item.included}
                    onChange={(e) => update(item.uid, { discountPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                    className="w-20"
                  />
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">{item.included ? "Sin cargo" : formatUsd(lineTotal(item))}</td>
                <td className="p-2">
                  <Input value={item.note} onChange={(e) => update(item.uid, { note: e.target.value })} />
                </td>
                <td className="p-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => remove(item.uid)}>
                    Quitar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ml-auto grid max-w-xs grid-cols-2 gap-1 text-sm">
        <span>Subtotal</span>
        <b className="text-right tabular-nums">{formatUsd(subtotal)}</b>
        {taxMode === "ADDED" ? (
          <>
            {[...ivaByRate.entries()].map(([rate, amount]) => (
              <span key={rate} className="contents">
                <span>IVA {rate}%</span>
                <b className="text-right tabular-nums">{formatUsd(amount)}</b>
              </span>
            ))}
            <span>Total</span>
            <b className="text-right tabular-nums">{formatUsd(subtotal + iva)}</b>
          </>
        ) : taxMode === "NOTE" ? (
          <span className="col-span-2 text-xs text-muted-foreground">Precios + IVA: el documento lo aclara (no se suma).</span>
        ) : null}
      </div>
    </div>
  );
}
