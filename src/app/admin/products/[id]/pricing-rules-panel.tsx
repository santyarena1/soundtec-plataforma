"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clearProductsMarkup, setProductsMarkup, updateRuleMarkup } from "@/server/actions/price-editor";
import { updateDiscountRulePercent, type ProductRuleRow, type ProductRulesData } from "@/server/actions/product-pricing-rules";

type Data = Extract<ProductRulesData, { ok: true }>;
type ActionResult = { ok: true; changed: number } | { ok: false; error: string };

const parse = (v: string) => Number(v.replace(",", "."));
const fmtMarkup = (v: number) => `×${Number(v.toFixed(4))}`;

function RuleRow({
  row,
  kind,
  editable,
  onSave,
  onClear,
  pending,
}: {
  row: ProductRuleRow;
  kind: "margin" | "discount";
  editable: boolean;
  onSave: (value: number) => void;
  onClear?: () => void;
  pending: boolean;
}) {
  const [value, setValue] = useState(String(Number(row.value.toFixed(4))));
  const changed = parse(value) !== Number(row.value.toFixed(4));
  const reach =
    row.scope === "PRODUCT"
      ? "Solo este producto."
      : row.groupSize > 1
        ? `Cambia las ${row.groupSize} subreglas de este grupo (todos sus productos).`
        : `Cambia el precio de todos los productos de ${row.scopeLabel.replace(/^[^:]+: /, "")}.`;
  return (
    <li className={`grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${row.applied ? "bg-primary/5" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{row.scopeLabel}</span>
          {row.applied ? <Badge tone="success">Aplica hoy</Badge> : null}
          {row.exempt ? <Badge tone="muted">Este producto está exceptuado</Badge> : null}
          {row.origin === "soundtube" ? <Badge tone="accent">Lista SoundTube</Badge> : null}
          {row.origin === "catalog" ? <Badge tone="accent">Markup propio</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted-foreground" title={row.name}>
          {row.name} · {editable ? reach : "Sin permiso para editarla."}
          {row.origin === "soundtube" ? " La próxima lista SoundTube la vuelve a escribir: para fijar otro valor usá «Markup propio»." : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-28">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            disabled={!editable || pending}
            className="pr-7 text-right tabular-nums"
            aria-label={`${kind === "margin" ? "Markup" : "Descuento"} de ${row.scopeLabel}`}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{kind === "margin" ? "×" : "%"}</span>
        </div>
        {editable ? (
          <Button
            type="button"
            size="sm"
            variant={changed ? "primary" : "outline"}
            disabled={!changed || pending || !Number.isFinite(parse(value))}
            onClick={() => {
              if (row.scope !== "PRODUCT" && !window.confirm(`${reach} ¿Seguir?`)) return;
              onSave(parse(value));
            }}
          >
            Guardar
          </Button>
        ) : null}
        {onClear && editable ? (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onClear}>
            Quitar
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function PricingRulesPanel({ productId, data }: { productId: string; data: Data }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [ownMarkup, setOwnMarkup] = useState("");
  const hasOwnMarkup = data.margins.some((r) => r.origin === "catalog");

  function run(action: () => Promise<ActionResult>, done: string) {
    setMessage(null);
    start(async () => {
      const result = await action();
      if (!result.ok) return setMessage({ ok: false, text: result.error });
      setMessage({ ok: true, text: done });
      router.refresh();
    });
  }

  return (
    <Card data-tour="product-pricing-rules">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="heading-3">Reglas de precio de este producto</h2>
            <p className="text-xs text-muted-foreground">
              Márgenes y descuentos que le tocan, del más específico al más general. Gana el primero de cada lista que aplica (marcado «Aplica hoy»).
            </p>
          </div>
          {pending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>

        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Margen (markup)</h3>
            <Link href="/admin/margins" className="text-xs text-primary hover:underline">
              Crear o ver todas las reglas de margen
            </Link>
          </div>
          {data.margins.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {data.margins.map((row) => (
                <RuleRow
                  key={row.id}
                  row={row}
                  kind="margin"
                  editable={data.canMargins}
                  pending={pending}
                  onSave={(value) =>
                    run(() => (row.origin === "catalog" ? setProductsMarkup([productId], value) : updateRuleMarkup(row.id, value)), "Margen actualizado.")
                  }
                  onClear={row.origin === "catalog" ? () => run(() => clearProductsMarkup([productId]), "Markup propio quitado: vuelve a la regla general.") : undefined}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ninguna regla le aplica: usa {data.markupSource === "COEF_VTA" ? "el COEF VTA de la ficha" : "el markup por defecto"}.
            </p>
          )}
          {data.canMargins && !hasOwnMarkup ? (
            <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
              <div className="w-36">
                <Label>Markup propio</Label>
                <Input value={ownMarkup} onChange={(e) => setOwnMarkup(e.target.value)} inputMode="decimal" placeholder="Ej. 2,75" />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={pending || !(parse(ownMarkup) > 1)}
                onClick={() => run(() => setProductsMarkup([productId], parse(ownMarkup)), "Markup propio creado.")}
              >
                Crear regla de este producto
              </Button>
              <p className="w-full text-xs text-muted-foreground">Manda sobre la marca, la categoría y la lista SoundTube. Solo afecta a este producto.</p>
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Descuentos</h3>
            <Link href="/admin/discounts" className="text-xs text-primary hover:underline">
              Crear o ver todas las reglas de descuento
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            {data.productDiscountPercent != null && data.productDiscountPercent > 0
              ? `Este producto tiene un descuento especial del ${data.productDiscountPercent}% (campo «Descuento especial» de arriba): manda sobre las reglas generales.`
              : "El descuento propio del producto se carga en «Descuento especial» (arriba, en esta solapa)."}
            {data.clientRulesCount ? ` Además hay ${data.clientRulesCount} condición(es) de clientes que le aplican; se editan en la ficha de cada cliente.` : ""}
          </p>
          {data.discounts.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {data.discounts.map((row) => (
                <RuleRow
                  key={row.id}
                  row={row}
                  kind="discount"
                  editable={data.canDiscounts}
                  pending={pending}
                  onSave={(value) => run(() => updateDiscountRulePercent(row.id, value), "Descuento actualizado.")}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ninguna regla de descuento general le aplica.</p>
          )}
        </section>

        {message ? <p className={`text-sm ${message.ok ? "text-success" : "text-destructive"}`}>{message.text}</p> : null}
      </CardContent>
    </Card>
  );
}
