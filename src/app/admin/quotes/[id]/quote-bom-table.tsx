"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { QuoteRevisePanel } from "./revise-panel";
import { QuoteLinePhoto } from "@/components/quotes/quote-line-photo";
import { RegenerateShortDescription } from "@/components/quotes/regenerate-short-description";
import { addServiceToQuote } from "@/server/actions/quote-export";
import {
  deleteQuoteItem,
  toggleQuoteItemLock,
  toggleQuoteItemOptional,
  updateQuoteItem,
} from "@/server/actions/quotes";
import {
  createQuoteItemGroup,
  deleteQuoteItemGroup,
  moveQuoteItemToGroup,
  updateQuoteItemGroup,
} from "@/server/actions/quote-groups";
import { QuoteProductPicker } from "../quote-product-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { formatUsd } from "@/lib/utils";
import { buildQuoteZones } from "@/lib/quote-item-groups";

export type QuoteBomRow = {
  id: string;
  quantity: number;
  unit: string;
  description: string;
  name: string;
  blurb: string | null;
  unitPriceUsd: number;
  lineTotalUsd: number;
  ivaRate: number;
  deliveryKey: string;
  optional: boolean;
  locked: boolean;
  photoUrl: string | null;
  productId: string | null;
  groupId: string | null;
};

export type QuoteBomGroup = {
  id: string;
  title: string;
  body: string;
};

function saveRow(form: HTMLFormElement | null) {
  if (!form || form.dataset.dirty !== "1") return;
  form.dataset.dirty = "0";
  form.requestSubmit();
}

function ZoneTable({
  quoteId,
  items,
  groups,
  deliveryOptions,
  showDelivery,
  issued,
  totalLabel,
  total,
}: {
  quoteId: string;
  items: QuoteBomRow[];
  groups: QuoteBomGroup[];
  deliveryOptions: string[];
  showDelivery: boolean;
  issued: boolean;
  totalLabel: string;
  total: number;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const cols = showDelivery ? 9 : 8;

  return (
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
              <td colSpan={cols} className="px-4 py-10 text-center text-sm text-muted-foreground">
                Todavía no hay equipos en este ambiente.
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const formId = `bom-${item.id}`;
              return (
                <tr key={item.id} className="border-b border-border align-top odd:bg-white even:bg-[#f6f7f9]">
                  <td className="px-3 py-2">
                    {item.productId ? (
                      <QuoteLinePhoto
                        quoteId={quoteId}
                        productId={item.productId}
                        caption={item.name}
                        photoUrl={item.photoUrl}
                        issued={issued}
                      />
                    ) : (
                      <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                        {item.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.photoUrl} alt="" className="h-full w-full object-contain p-1" />
                        ) : (
                          <span className="px-1 text-center text-[9px] leading-tight text-muted-foreground">Sin foto</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <form id={formId} action={updateQuoteItem} onInput={(e) => (e.currentTarget.dataset.dirty = "1")} />
                    <input type="hidden" name="itemId" form={formId} value={item.id} />
                    <Input
                      form={formId}
                      name="quantity"
                      defaultValue={item.quantity}
                      disabled={issued}
                      className="h-9 w-[4.25rem] text-right tabular-nums"
                      onBlur={(e) => saveRow(e.currentTarget.form)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      form={formId}
                      name="unit"
                      defaultValue={item.unit}
                      disabled={issued}
                      className="h-9 w-[3.25rem]"
                      onBlur={(e) => saveRow(e.currentTarget.form)}
                    />
                  </td>
                  <td className="px-2 py-2 min-w-[280px]">
                    <Textarea
                      form={formId}
                      name="description"
                      defaultValue={item.description || item.name}
                      rows={2}
                      disabled={issued}
                      className="mb-1 min-h-[40px] font-bold leading-snug"
                      onChange={(e) => {
                        const form = e.currentTarget.form;
                        if (form) form.dataset.dirty = "1";
                      }}
                      onBlur={(e) => saveRow(e.currentTarget.form)}
                    />
                    {item.blurb ? (
                      <p className="mb-1 text-xs leading-snug text-foreground/80" style={{ textAlign: "justify" }}>
                        {item.blurb}
                      </p>
                    ) : (
                      <p className="mb-1 text-[11px] text-muted-foreground">Sin descripción corta.</p>
                    )}
                    {item.productId && !issued ? (
                      <RegenerateShortDescription quoteId={quoteId} productId={item.productId} />
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      form={formId}
                      name="unitPriceUsd"
                      defaultValue={item.unitPriceUsd}
                      disabled={issued}
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
                      disabled={issued}
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
                        disabled={issued}
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
                        {deliveryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Select>
                    </td>
                  ) : null}
                  <td className="px-2 py-2">
                    {!issued ? (
                      <div className="flex flex-col items-stretch gap-1">
                        {item.optional ? <Badge tone="accent">Opcional</Badge> : null}
                        {groups.length > 0 ? (
                          <Select
                            defaultValue={item.groupId || ""}
                            className="h-8 text-xs"
                            onChange={(e) =>
                              start(async () => {
                                const result = await moveQuoteItemToGroup({
                                  itemId: item.id,
                                  groupId: e.target.value || null,
                                });
                                if (!result.ok) toast.error(result.error || "No se pudo mover.");
                                else router.refresh();
                              })
                            }
                          >
                            <option value="">General</option>
                            {groups.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.title}
                              </option>
                            ))}
                          </Select>
                        ) : null}
                        <form action={toggleQuoteItemOptional}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <Button type="submit" size="sm" variant="ghost" className="w-full">
                            {item.optional ? "No opcional" : "Opcional"}
                          </Button>
                        </form>
                        <form action={toggleQuoteItemLock}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            className="w-full"
                            title="Evita que la IA reescriba este ítem. Vos podés editarlo igual."
                          >
                            {item.locked ? "Desfijar IA" : "Fijar IA"}
                          </Button>
                        </form>
                        <form action={deleteQuoteItem}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <Button type="submit" size="sm" variant="ghost" className="w-full">
                            Quitar
                          </Button>
                        </form>
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
                {totalLabel}
              </td>
              <td className="px-2 py-3 text-right text-sm font-semibold tabular-nums">{formatUsd(total)}</td>
              <td colSpan={showDelivery ? 3 : 2} />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export function QuoteBomTable({
  quoteId,
  items,
  groups,
  deliveryOptions,
  showDelivery,
  issued,
  total,
}: {
  quoteId: string;
  items: QuoteBomRow[];
  groups: QuoteBomGroup[];
  deliveryOptions: string[];
  showDelivery: boolean;
  issued: boolean;
  total: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const multi = groups.length > 0;
  const zones = buildQuoteZones(
    items,
    groups.map((group, index) => ({ ...group, sortOrder: index }))
  );

  const activeCount = items.filter((item) => !item.optional).length;
  const needle = filter.trim().toLowerCase();

  const filteredZones = useMemo(() => {
    if (!needle) return zones;
    return zones
      .map((zone) => ({
        ...zone,
        items: zone.items.filter((item) => {
          const hay = [item.name, item.description, item.blurb || "", item.deliveryKey].join(" ").toLowerCase();
          return hay.includes(needle);
        }),
      }))
      .filter((zone) => zone.items.length > 0 || !needle);
  }, [zones, needle]);

  function toggleZone(zoneKey: string) {
    setCollapsed((prev) => ({ ...prev, [zoneKey]: !prev[zoneKey] }));
  }

  return (
    <div className="space-y-5" data-tour="quote-bom">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Planilla de productos y servicios</h2>
            <p className="text-xs text-muted-foreground">
              {activeCount} ítem{activeCount === 1 ? "" : "s"} · Neto {formatUsd(total)}
            </p>
          </div>
          <div className="flex min-w-[220px] flex-1 flex-wrap items-center justify-end gap-2 sm:max-w-md">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar filas…"
                className="h-9 pl-8"
              />
            </div>
            {!issued ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-tour="quote-add-zone"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await createQuoteItemGroup({ quoteId });
                    if (!result.ok) {
                      toast.error(result.error || "No se pudo crear el ambiente.");
                      return;
                    }
                    toast.success("Ambiente agregado", {
                      description: "Poné el título, la explicación y los equipos de esa zona.",
                    });
                    router.refresh();
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Ambiente
              </Button>
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {multi
            ? "Cada ambiente tiene su texto y su tabla. Lo importado del cliente es referencia: podés editar cantidad, título, unidad, precio, IVA y entrega. Los opcionales no suman al total."
            : "Lo que pidió el cliente es referencia: podés cambiar cantidad, título, unidad, precio, IVA y entrega. Editá directo en la tabla."}
        </p>
      </div>

      {filteredZones.map((zone) => {
        const zoneKey = zone.id || "general";
        const isCollapsed = collapsed[zoneKey] === true;
        const subtotal = zone.items.filter((item) => !item.optional).reduce((sum, item) => sum + item.lineTotalUsd, 0);
        return (
          <section key={zoneKey} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 border-b border-border bg-secondary/30 px-4 py-2.5 text-left"
              onClick={() => toggleZone(zoneKey)}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {zone.title}
                <span className="font-normal text-muted-foreground">({zone.items.length})</span>
              </span>
              {zone.items.length > 0 ? (
                <span className="text-xs font-medium tabular-nums text-muted-foreground">{formatUsd(subtotal)}</span>
              ) : null}
            </button>

            {!isCollapsed ? (
              <div className="space-y-3 p-3">
            {multi ? (
              <div className="space-y-2">
                {zone.id && !issued ? (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Input
                      defaultValue={zone.title}
                      className="max-w-md font-semibold"
                      onBlur={(e) => {
                        const title = e.target.value.trim();
                        if (!title || title === zone.title) return;
                        start(async () => {
                          const result = await updateQuoteItemGroup({ groupId: zone.id as string, title });
                          if (!result.ok) toast.error(result.error || "No se pudo guardar el título.");
                          else router.refresh();
                        });
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        start(async () => {
                          const result = await deleteQuoteItemGroup({ groupId: zone.id as string });
                          if (!result.ok) toast.error(result.error || "No se pudo quitar.");
                          else {
                            toast.success("Ambiente quitado. Los equipos volvieron a general.");
                            router.refresh();
                          }
                        })
                      }
                    >
                      Quitar ambiente
                    </Button>
                  </div>
                ) : null}
                {zone.id ? (
                  <Textarea
                    defaultValue={zone.body}
                    rows={3}
                    disabled={issued}
                    placeholder="Explicación de este ambiente: qué se propone, por qué estos equipos…"
                    onBlur={(e) => {
                      if (issued || e.target.value === zone.body) return;
                      start(async () => {
                        const result = await updateQuoteItemGroup({
                          groupId: zone.id as string,
                          body: e.target.value,
                        });
                        if (!result.ok) toast.error(result.error || "No se pudo guardar la explicación.");
                      });
                    }}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Equipos sin ambiente asignado. Movelos con el selector de cada fila.
                  </p>
                )}
              </div>
            ) : null}

            {!issued ? <QuoteProductPicker quoteId={quoteId} groupId={zone.id} /> : null}
            {!issued ? (
              <form action={addServiceToQuote} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-secondary/10 p-3">
                <input type="hidden" name="quoteId" value={quoteId} />
                {zone.id ? <input type="hidden" name="groupId" value={zone.id} /> : null}
                <Input name="description" placeholder="Servicio (instalación, materiales…)" className="min-w-[220px] flex-1" />
                <Input name="quantity" defaultValue="1" className="w-20" />
                <Input name="unitPriceUsd" placeholder="USD" className="w-28" />
                <Button type="submit" size="sm" variant="outline">
                  Agregar servicio
                </Button>
              </form>
            ) : null}

            <ZoneTable
              quoteId={quoteId}
              items={zone.items}
              groups={groups}
              deliveryOptions={deliveryOptions}
              showDelivery={showDelivery}
              issued={issued}
              totalLabel={multi ? `Subtotal ${zone.title}` : "Total neto USD"}
              total={multi ? subtotal : total}
            />
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
