"use client";

import Link from "next/link";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatUsd } from "@/lib/utils";
import {
  sendRequest,
  removeRequestItemForm,
  updateDraftItemQuantityForm,
} from "@/server/actions/requests";
import { Send, Trash2, ShoppingBag } from "lucide-react";

interface Item {
  id: string;
  quantity: number;
  product: { id: string; normalizedName: string };
  unitPrice: number;
}

interface Props {
  requestId: string;
  items: Item[];
  projectDescription: string | null;
  subtotal: number;
}

export function DraftRequestEditor({ requestId, items, projectDescription, subtotal }: Props) {
  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="space-y-2 p-5">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Tu solicitud en armado</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Acá reunís los productos que querés cotizar o pedir. Cuando esté lista, enviá la solicitud a Soundtec.
            Desde el catálogo, «Agregar a mi solicitud» suma productos acá automáticamente.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <CardTitle>Productos ({items.length})</CardTitle>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no agregaste productos.{" "}
              <Link href="/portal/products" className="text-accent underline">
                Ir al catálogo
              </Link>
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH>Cant.</TH>
                  <TH className="text-right">P. unit.</TH>
                  <TH className="text-right">Subtotal</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {items.map((i) => (
                  <TR key={i.id}>
                    <TD>
                      <Link href={`/portal/products/${i.product.id}`} className="font-medium hover:underline">
                        {i.product.normalizedName}
                      </Link>
                    </TD>
                    <TD>
                      <form action={updateDraftItemQuantityForm} className="flex items-center gap-1">
                        <input type="hidden" name="itemId" value={i.id} />
                        <Input name="quantity" type="number" min={1} defaultValue={i.quantity} className="h-8 w-16" />
                        <Button type="submit" size="sm" variant="ghost">
                          OK
                        </Button>
                      </form>
                    </TD>
                    <TD className="text-right">{formatUsd(i.unitPrice)}</TD>
                    <TD className="text-right font-medium">{formatUsd(i.unitPrice * i.quantity)}</TD>
                    <TD>
                      <form action={removeRequestItemForm}>
                        <input type="hidden" name="itemId" value={i.id} />
                        <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {items.length > 0 ? (
            <div className="flex justify-end border-t border-border pt-3">
              <span className="text-muted-foreground">Total estimado:&nbsp;</span>
              <span className="text-lg font-semibold">{formatUsd(subtotal)}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <form action={sendRequest} className="space-y-4">
            <input type="hidden" name="requestId" value={requestId} />
            <div>
              <Label htmlFor="projectDescription">Proyecto / contexto para Soundtec</Label>
              <Textarea
                id="projectDescription"
                name="projectDescription"
                defaultValue={projectDescription || ""}
                rows={4}
                placeholder="Describí el proyecto, plazos, ubicación o cualquier detalle relevante."
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                href="/portal/products"
                className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary"
              >
                Seguir agregando productos
              </Link>
              <Button type="submit" disabled={items.length === 0} size="lg">
                <Send className="h-4 w-4" /> Enviar solicitud a Soundtec
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
