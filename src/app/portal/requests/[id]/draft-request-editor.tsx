"use client";

import Link from "next/link";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import {
  sendRequest,
  removeRequestItemForm,
  updateDraftItemQuantityForm,
} from "@/server/actions/requests";
import { Send, Trash2, ShoppingBag, Box, Wrench, MessageSquare, ArrowRight } from "lucide-react";

interface Item {
  id: string;
  quantity: number;
  product: {
    id: string;
    normalizedName: string;
    kind?: "PRINCIPAL" | "ACCESORIO" | null;
    imageUrl?: string | null;
    brand?: string | null;
  };
  userNotes?: string | null;
  unitPrice: number;
}

interface Props {
  requestId: string;
  items: Item[];
  projectDescription: string | null;
  subtotal: number;
}

export function DraftRequestEditor({ requestId, items, projectDescription, subtotal }: Props) {
  const totalUnits = items.reduce((acc, it) => acc + it.quantity, 0);
  const principals = items.filter((i) => (i.product.kind ?? "PRINCIPAL") !== "ACCESORIO");
  const accessories = items.filter((i) => i.product.kind === "ACCESORIO");
  const accessorySubtotal = accessories.reduce(
    (acc, i) => acc + i.unitPrice * i.quantity,
    0
  );
  const principalSubtotal = principals.reduce(
    (acc, i) => acc + i.unitPrice * i.quantity,
    0
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      {/* Columna principal */}
      <div className="space-y-4">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/8 to-card">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-start gap-2">
              <ShoppingBag className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <CardTitle className="text-lg">Tu solicitud en armado</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Acá reunís los productos que querés cotizar o pedir. Cuando esté lista,
                  enviá la solicitud a Soundtec.{" "}
                  <Link href="/portal/products" className="text-accent underline">
                    Seguir agregando productos
                  </Link>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                <Box className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Todavía no agregaste productos a esta solicitud.
              </p>
              <Link
                href="/portal/products"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Ir al catálogo <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {/* Productos principales */}
        {principals.length > 0 ? (
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Box className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Productos principales</CardTitle>
                <Badge tone="muted">{principals.length}</Badge>
              </div>
              <ItemList items={principals} />
            </CardContent>
          </Card>
        ) : null}

        {/* Accesorios — sección visualmente diferenciada */}
        {accessories.length > 0 ? (
          <Card className="border-warning/30">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-warning" />
                  <CardTitle className="text-base">Accesorios</CardTitle>
                  <Badge tone="warning">{accessories.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Subtotal accesorios:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatUsd(accessorySubtotal)}
                  </span>
                </p>
              </div>
              <ItemList items={accessories} variant="accessory" />
            </CardContent>
          </Card>
        ) : null}

        {/* Formulario proyecto + envío */}
        <Card>
          <CardContent className="p-5">
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
                <p className="text-[11px] text-muted-foreground mt-1">
                  Cuanta más info des, más rápida y precisa va a ser la respuesta.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Link
                  href="/portal/products"
                  className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary"
                >
                  Seguir agregando
                </Link>
                <Button type="submit" disabled={items.length === 0} size="lg">
                  <Send className="h-4 w-4" /> Enviar a Soundtec
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Sidebar resumen sticky */}
      <aside className="lg:sticky lg:top-6 lg:self-start space-y-4">
        <Card className="border-primary/30">
          <CardContent className="p-5 space-y-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              Resumen
            </CardTitle>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-md border border-border bg-secondary/40 p-3">
                <p className="text-2xl font-bold tabular-nums">{items.length}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  producto{items.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="rounded-md border border-border bg-secondary/40 p-3">
                <p className="text-2xl font-bold tabular-nums">{totalUnits}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">unidades</p>
              </div>
            </div>
            <div className="space-y-1.5 border-t border-border pt-3 text-sm">
              {principals.length > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Principales ({principals.length})</span>
                  <span className="tabular-nums">{formatUsd(principalSubtotal)}</span>
                </div>
              ) : null}
              {accessories.length > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Accesorios ({accessories.length})</span>
                  <span className="tabular-nums">{formatUsd(accessorySubtotal)}</span>
                </div>
              ) : null}
            </div>
            <div className="flex items-end justify-between border-t border-border pt-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Total estimado
                </p>
                <p className="text-2xl font-bold tabular-nums text-success">{formatUsd(subtotal)}</p>
              </div>
              <p className="text-[10px] text-muted-foreground text-right max-w-[120px]">
                Sujeto a confirmación y disponibilidad
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="p-3 space-y-1 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">¿Cómo sigue?</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Enviás tu solicitud.</li>
              <li>El equipo Soundtec la revisa.</li>
              <li>Te responden con cotización oficial.</li>
              <li>Confirmás y avanzamos.</li>
            </ol>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function ItemList({
  items,
  variant = "principal",
}: {
  items: Item[];
  variant?: "principal" | "accessory";
}) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li
          key={i.id}
          className={`rounded-md border bg-card p-3 transition-colors ${
            variant === "accessory" ? "border-warning/20 bg-warning/5" : "border-border"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-secondary border border-border">
              {i.product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={i.product.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Box className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/portal/products/${i.product.id}`}
                    className="font-medium text-sm hover:underline block truncate"
                  >
                    {i.product.normalizedName}
                  </Link>
                  {i.product.brand ? (
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {i.product.brand}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatUsd(i.unitPrice * i.quantity)}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {formatUsd(i.unitPrice)} × {i.quantity}
                  </p>
                </div>
              </div>
              {i.userNotes ? (
                <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
                  <MessageSquare className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{i.userNotes}</span>
                </p>
              ) : null}
              <div className="flex items-center gap-2 pt-1">
                <form
                  action={updateDraftItemQuantityForm}
                  className="flex items-center gap-1"
                >
                  <input type="hidden" name="itemId" value={i.id} />
                  <Input
                    name="quantity"
                    type="number"
                    min={1}
                    defaultValue={i.quantity}
                    className="h-8 w-20 text-sm"
                  />
                  <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                    Actualizar
                  </Button>
                </form>
                <form action={removeRequestItemForm}>
                  <input type="hidden" name="itemId" value={i.id} />
                  <Button
                    type="submit"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-destructive hover:bg-destructive/10"
                    title="Quitar de la solicitud"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
