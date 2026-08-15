"use client";

import { QuoteRevisePanel } from "./revise-panel";
import { addServiceToQuote } from "@/server/actions/quote-export";
import {
  deleteQuoteItem,
  toggleQuoteItemLock,
  toggleQuoteItemOptional,
  updateQuoteItem,
} from "@/server/actions/quotes";
import { QuoteProductPicker } from "../quote-product-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { formatUsd } from "@/lib/utils";

export type QuoteBomRow = {
  id: string;
  quantity: number;
  unit: string;
  description: string;
  unitPriceUsd: number;
  lineTotalUsd: number;
  ivaRate: number;
  deliveryKey: string;
  optional: boolean;
  locked: boolean;
  photoUrl: string | null;
};

function saveRow(form: HTMLFormElement | null) {
  if (!form || form.dataset.dirty !== "1") return;
  form.dataset.dirty = "0";
  form.requestSubmit();
}

export function QuoteBomTable({
  quoteId,
  items,
  deliveryOptions,
  showDelivery,
  issued,
  total,
}: {
  quoteId: string;
  items: QuoteBomRow[];
  deliveryOptions: string[];
  showDelivery: boolean;
  issued: boolean;
  total: number;
}) {
  const cols = showDelivery ? 9 : 8;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Planilla de productos y servicios</h2>
          <p className="text-xs text-muted-foreground">Celdas editables. Al salir del campo se guarda. Tab para avanzar.</p>
        </div>
        <p className="text-sm font-semibold tabular-nums">Neto {formatUsd(total)}</p>
      </div>

      {!issued ? <QuoteProductPicker quoteId={quoteId} /> : null}

      {!issued ? (
        <form action={addServiceToQuote} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
          <input type="hidden" name="quoteId" value={quoteId} />
          <Input name="description" placeholder="Servicio (instalación, materiales…)" className="min-w-[220px] flex-1" />
          <Input name="quantity" defaultValue="1" className="w-20" />
          <Input name="unitPriceUsd" placeholder="USD" className="w-28" />
          <Button type="submit" size="sm" variant="outline">
            Agregar servicio
          </Button>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full min-w-[1040px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#1e3553] text-left text-[11px] font-semibold uppercase tracking-wide text-white">
              <th className="px-3 py-2.5">Foto</th>
              <th className="px-2 py-2.5">Cant</th>
              <th className="px-2 py-2.5">U</th>
              <th className="px-2 py-2.5">Detalle</th>
              <th className="px-2 py-2.5 text-right">Unit. USD</th>
              <th className="px-2 py-2.5 text-right">Total</th>
              <th className="px-2 py-2.5">IVA %</th>
              {showDelivery ? <th className="px-2 py-2.5">Entrega</th> : null}
              <th className="px-2 py-2.5"> </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={cols} className="px-4 py-14 text-center text-sm text-muted-foreground">
                  Planilla vacía. Buscá en el catálogo o generá la propuesta con el brief y los planos.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const formId = `bom-${item.id}`;
                const locked = issued || item.locked;
                return (
                  <tr key={item.id} className="border-b border-border align-top odd:bg-white even:bg-[#f6f7f9]">
                    <td className="px-3 py-2">
                      <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                        {item.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.photoUrl} alt="" className="h-full w-full object-contain p-1" />
                        ) : (
                          <span className="px-1 text-center text-[9px] leading-tight text-muted-foreground">Sin foto</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <form id={formId} action={updateQuoteItem} onInput={(e) => (e.currentTarget.dataset.dirty = "1")} />
                      <input type="hidden" name="itemId" form={formId} value={item.id} />
                      <Input
                        form={formId}
                        name="quantity"
                        defaultValue={item.quantity}
                        disabled={locked}
                        className="h-9 w-[4.25rem] text-right tabular-nums"
                        onBlur={(e) => saveRow(e.currentTarget.form)}
                      />
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">{item.unit}</td>
                    <td className="px-2 py-2 min-w-[280px]">
                      <Textarea
                        form={formId}
                        name="description"
                        defaultValue={item.description}
                        rows={3}
                        disabled={locked}
                        className="min-h-[72px] leading-snug"
                        onBlur={(e) => saveRow(e.currentTarget.form)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        form={formId}
                        name="unitPriceUsd"
                        defaultValue={item.unitPriceUsd}
                        disabled={locked}
                        className="h-9 w-[7rem] text-right tabular-nums"
                        onBlur={(e) => saveRow(e.currentTarget.form)}
                      />
                    </td>
                    <td className="px-2 py-3 text-right font-medium tabular-nums">{formatUsd(item.lineTotalUsd)}</td>
                    <td className="px-2 py-2">
                      <Input
                        form={formId}
                        name="ivaRate"
                        defaultValue={item.ivaRate}
                        disabled={locked}
                        className="h-9 w-14 text-right tabular-nums"
                        onBlur={(e) => saveRow(e.currentTarget.form)}
                      />
                    </td>
                    {showDelivery ? (
                      <td className="px-2 py-2">
                        <Select
                          form={formId}
                          name="deliveryKey"
                          defaultValue={item.deliveryKey}
                          disabled={locked}
                          className="h-9 min-w-[8rem]"
                          onChange={(e) => {
                            const form = e.currentTarget.form;
                            if (form) {
                              form.dataset.dirty = "1";
                              saveRow(form);
                            }
                          }}
                        >
                          <option value="">—</option>
                          {deliveryOptions.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </Select>
                      </td>
                    ) : null}
                    <td className="px-2 py-2">
                      {!issued ? (
                        <div className="flex flex-col items-stretch gap-1">
                          {item.optional ? <Badge tone="accent">Opcional</Badge> : null}
                          <form action={toggleQuoteItemOptional}>
                            <input type="hidden" name="itemId" value={item.id} />
                            <Button type="submit" size="sm" variant="ghost" className="w-full">
                              {item.optional ? "No opcional" : "Opcional"}
                            </Button>
                          </form>
                          <form action={toggleQuoteItemLock}>
                            <input type="hidden" name="itemId" value={item.id} />
                            <Button type="submit" size="sm" variant="ghost" className="w-full">
                              {item.locked ? "Desfijar" : "Fijar"}
                            </Button>
                          </form>
                          {!item.locked ? (
                            <form action={deleteQuoteItem}>
                              <input type="hidden" name="itemId" value={item.id} />
                              <Button type="submit" size="sm" variant="ghost" className="w-full">
                                Quitar
                              </Button>
                            </form>
                          ) : null}
                          <QuoteRevisePanel quoteId={quoteId} nodeId={item.id} kind="item" />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {items.length > 0 ? (
            <tfoot>
              <tr className="bg-[#eef1f5]">
                <td colSpan={showDelivery ? 5 : 4} className="px-3 py-3 text-right text-sm">
                  Total neto USD
                </td>
                <td className="px-2 py-3 text-right text-sm font-semibold tabular-nums">{formatUsd(total)}</td>
                <td colSpan={showDelivery ? 3 : 2} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
