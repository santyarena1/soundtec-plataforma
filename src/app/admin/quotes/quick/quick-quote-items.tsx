"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils";

export type QuickItem = {
  productId: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitPriceUsd: number;
  discountPercent: number;
  note: string;
  included: boolean;
};

export function QuickQuoteItems({
  items,
  onChange,
}: {
  items: QuickItem[];
  onChange: (items: QuickItem[]) => void;
}) {
  const update = (index: number, patch: Partial<QuickItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      (item.included ? 0 : item.quantity * item.unitPriceUsd * (1 - item.discountPercent / 100)),
    0,
  );
  const iva = subtotal * 0.21;
  if (!items.length)
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Agregá productos para empezar.
      </p>
    );
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="p-2 text-left">Producto</th>
              <th>Cant.</th>
              <th>Precio USD</th>
              <th>Desc. %</th>
              <th>Nota</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.productId} className="border-t">
                <td className="p-2">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.sku || "Sin SKU"}
                    {item.included ? " · Incluido sin cargo" : ""}
                  </p>
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={item.quantity}
                    onChange={(e) => update(index, { quantity: Number(e.target.value) })}
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
                    onChange={(e) => update(index, { unitPriceUsd: Number(e.target.value) })}
                    className="w-28"
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={item.discountPercent}
                    disabled={item.included}
                    onChange={(e) => update(index, { discountPercent: Number(e.target.value) })}
                    className="w-20"
                  />
                </td>
                <td className="p-2">
                  <Input
                    value={item.note}
                    onChange={(e) => update(index, { note: e.target.value })}
                  />
                </td>
                <td className="p-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onChange(items.filter((_, i) => i !== index))}
                  >
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
        <b className="text-right">{formatUsd(subtotal)}</b>
        <span>IVA 21%</span>
        <b className="text-right">{formatUsd(iva)}</b>
        <span>Total</span>
        <b className="text-right">{formatUsd(subtotal + iva)}</b>
      </div>
    </div>
  );
}
