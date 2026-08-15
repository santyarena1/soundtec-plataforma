import { notFound } from "next/navigation";
import { loadQuoteForUser } from "@/lib/quote-access";
import { getDeliveryOptions } from "@/lib/quote-settings";
import { prisma } from "@/lib/prisma";
import {
  deleteQuoteItem,
  saveQuoteMeta,
  toggleQuoteItemLock,
  toggleQuoteSectionLock,
  updateQuoteItem,
  updateQuoteSection,
} from "@/server/actions/quotes";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import { QuoteProductPicker } from "../quote-product-picker";
import { QuoteRevisePanel } from "./revise-panel";

export const metadata = { title: "Admin · Cotización" };

export default async function QuoteEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { quote, forbidden } = await loadQuoteForUser(id);
  if (forbidden) notFound();
  if (!quote) notFound();

  const [clients, deliveryOptions] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    getDeliveryOptions(),
  ]);

  const issued = quote.status === "ISSUED";
  const total = quote.items.reduce((s, i) => s + Number(i.lineTotalUsd), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={quote.number}
        description={quote.reference || "Sin referencia"}
        actions={<Badge tone={issued ? "success" : "muted"}>{issued ? "Emitida (snapshot)" : "Borrador"}</Badge>}
      />

      <form action={saveQuoteMeta} className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="quoteId" value={quote.id} />
        <div>
          <Label htmlFor="clientId">Cliente</Label>
          <Select id="clientId" name="clientId" defaultValue={quote.clientId || ""} disabled={issued}>
            <option value="">Sin cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="reference">Referencia</Label>
          <Input id="reference" name="reference" defaultValue={quote.reference || ""} disabled={issued} />
        </div>
        <div>
          <Label htmlFor="layoutKey">Layout</Label>
          <Select id="layoutKey" name="layoutKey" defaultValue={quote.layoutKey} disabled={issued}>
            <option value="COMPACT">Compacto</option>
            <option value="STANDARD">Estándar</option>
            <option value="EDITORIAL">Editorial</option>
          </Select>
        </div>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="showDeliveryColumn" defaultChecked={quote.showDeliveryColumn} disabled={issued} />
            Columna entrega
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="alternativesEnabled" defaultChecked={quote.alternativesEnabled} disabled={issued} />
            Alternativas
          </label>
          {!issued ? (
            <Button type="submit" size="sm" variant="outline">
              Guardar cabecera
            </Button>
          ) : null}
        </div>
      </form>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="heading-3">Brief</h2>
          <form action={saveQuoteMeta} className="space-y-2">
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="layoutKey" value={quote.layoutKey} />
            <Textarea name="brief" rows={6} defaultValue={quote.brief || ""} disabled={issued} />
            {!issued ? (
              <Button type="submit" size="sm" variant="outline">
                Guardar brief
              </Button>
            ) : null}
          </form>
          <p className="text-xs text-muted-foreground">
            Generar propuesta con IA (planos, BOM, textos) queda enganchado a las API keys. Cada bloque se puede rehacer con una instrucción o a mano.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="heading-3">Productos y servicios</h2>
            <p className="text-sm text-muted-foreground">Total neto {formatUsd(total)}</p>
          </div>
          {!issued ? <QuoteProductPicker quoteId={quote.id} /> : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2">Cant</th>
                  <th className="py-2 pr-2">Detalle</th>
                  <th className="py-2 pr-2">Unit.</th>
                  <th className="py-2 pr-2">Total</th>
                  <th className="py-2 pr-2">IVA</th>
                  {quote.showDeliveryColumn ? <th className="py-2 pr-2">Entrega</th> : null}
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {quote.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-muted-foreground">
                      Sin ítems. Buscá en el catálogo o esperá la sugerencia de IA.
                    </td>
                  </tr>
                ) : (
                  quote.items.map((item) => (
                    <tr key={item.id} className="border-b align-top">
                      <td className="py-2 pr-2" colSpan={7}>
                        <form action={updateQuoteItem} className="grid grid-cols-12 gap-2">
                          <input type="hidden" name="itemId" value={item.id} />
                          <Input
                            name="quantity"
                            defaultValue={Number(item.quantity)}
                            className="col-span-1"
                            disabled={issued || item.locked}
                          />
                          <Textarea
                            name="description"
                            defaultValue={item.description}
                            rows={2}
                            className="col-span-5 min-h-[64px]"
                            disabled={issued || item.locked}
                          />
                          <Input
                            name="unitPriceUsd"
                            defaultValue={Number(item.unitPriceUsd)}
                            className="col-span-2"
                            disabled={issued || item.locked}
                          />
                          <div className="col-span-1 pt-2 text-right text-xs">{formatUsd(Number(item.lineTotalUsd))}</div>
                          <Input
                            name="ivaRate"
                            defaultValue={Number(item.ivaRate)}
                            className="col-span-1"
                            disabled={issued || item.locked}
                          />
                          {quote.showDeliveryColumn ? (
                            <Select
                              name="deliveryKey"
                              defaultValue={item.deliveryKey || ""}
                              className="col-span-1"
                              disabled={issued || item.locked}
                            >
                              <option value="">—</option>
                              {deliveryOptions.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </Select>
                          ) : null}
                          {!issued ? (
                            <div className="col-span-12 flex flex-wrap gap-2">
                              <Button type="submit" size="sm" variant="outline" disabled={item.locked}>
                                Guardar fila
                              </Button>
                            </div>
                          ) : null}
                        </form>
                        {!issued ? (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <form action={toggleQuoteItemLock}>
                              <input type="hidden" name="itemId" value={item.id} />
                              <Button type="submit" size="sm" variant="ghost">
                                {item.locked ? "Desfijar" : "Fijar"}
                              </Button>
                            </form>
                            {!item.locked ? (
                              <form action={deleteQuoteItem}>
                                <input type="hidden" name="itemId" value={item.id} />
                                <Button type="submit" size="sm" variant="ghost">
                                  Quitar
                                </Button>
                              </form>
                            ) : null}
                            <QuoteRevisePanel quoteId={quote.id} nodeId={item.id} kind="item" />
                            {item.source !== "MANUAL" ? (
                              <span className="text-[11px] text-muted-foreground">origen: {item.source}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="heading-3">Documento</h2>
        {quote.sections.map((section) => (
          <Card key={section.id}>
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">{section.title}</h3>
                {section.locked ? <Badge tone="warning">Fijada</Badge> : null}
                {section.stale ? <Badge tone="destructive">Revisar</Badge> : null}
              </div>
              <form action={updateQuoteSection} className="space-y-2">
                <input type="hidden" name="sectionId" value={section.id} />
                <Textarea
                  name="body"
                  rows={6}
                  defaultValue={section.body}
                  disabled={issued || section.locked}
                  className="min-h-[120px]"
                />
                {!issued && !section.locked ? (
                  <Button type="submit" size="sm" variant="outline">
                    Guardar texto
                  </Button>
                ) : null}
              </form>
              {!issued ? (
                <div className="flex flex-wrap gap-2">
                  <form action={toggleQuoteSectionLock}>
                    <input type="hidden" name="sectionId" value={section.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      {section.locked ? "Desfijar" : "Fijar"}
                    </Button>
                  </form>
                  <QuoteRevisePanel quoteId={quote.id} nodeId={section.id} kind="section" />
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
