"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import {
  clearAllManufacturerPromos,
  clearAllProductDiscounts,
  clearManufacturerPromo,
  clearProductDiscount,
} from "@/server/actions/pricing-rules";

export type ProductDiscountRow = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  percent: number;
};

export type ManufacturerPromoRow = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  label: string | null;
  saleUsd: number | null;
};

export function ProductDiscountsPanel({ rows }: { rows: ProductDiscountRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="heading-3">Descuentos en ficha de producto</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Estos sí bajan el precio. Vienen de la ficha, un Excel o una acción masiva — no de las
            reglas de arriba. Si ves -50% en el catálogo y acá no hay reglas, mirá esta lista.
          </p>
        </div>
        {rows.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (
                  !window.confirm(
                    `¿Quitamos el descuento de ficha en ${rows.length} producto${rows.length === 1 ? "" : "s"}? El precio vuelve a costo + margen.`
                  )
                ) {
                  return;
                }
                const result = await clearAllProductDiscounts();
                toast.success(`Se quitó el descuento en ${result.count} producto${result.count === 1 ? "" : "s"}.`);
                router.refresh();
              })
            }
          >
            Quitar todos
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <TableEmpty message="Ningún producto tiene descuento especial en la ficha." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Producto</TH>
              <TH>Marca</TH>
              <TH className="text-right">Descuento</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <Link href={`/admin/products/${row.id}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                  {row.sku ? <p className="text-xs text-muted-foreground">{row.sku}</p> : null}
                </TD>
                <TD className="text-sm text-muted-foreground">{row.brand || "—"}</TD>
                <TD className="text-right font-semibold tabular-nums">-{row.percent.toFixed(1)}%</TD>
                <TD className="text-right">
                  <form action={clearProductDiscount}>
                    <input type="hidden" name="productId" value={row.id} />
                    <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                      Quitar
                    </Button>
                  </form>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

export function ManufacturerPromosPanel({ rows }: { rows: ManufacturerPromoRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="heading-3">Etiquetas de oferta del fabricante</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Textos tipo “-50% OFF” o “ON SALE” copiados del portal del proveedor. No son un
            descuento de Soundtec y ya no se muestran al cliente. Acá podés borrarlos del back.
          </p>
        </div>
        {rows.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (!window.confirm(`¿Borramos las etiquetas de oferta del fabricante en ${rows.length} producto${rows.length === 1 ? "" : "s"}?`)) {
                  return;
                }
                const result = await clearAllManufacturerPromos();
                toast.success(`Se limpiaron ${result.count} ficha${result.count === 1 ? "" : "s"}.`);
                router.refresh();
              })
            }
          >
            Limpiar todas
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <TableEmpty message="No hay etiquetas de oferta del fabricante." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Producto</TH>
              <TH>Marca</TH>
              <TH>Etiqueta</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <Link href={`/admin/products/${row.id}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                  {row.sku ? <p className="text-xs text-muted-foreground">{row.sku}</p> : null}
                </TD>
                <TD className="text-sm text-muted-foreground">{row.brand || "—"}</TD>
                <TD className="text-sm">
                  {row.label || "Oferta del fabricante"}
                  {row.saleUsd != null ? (
                    <span className="text-muted-foreground"> · USD {row.saleUsd.toFixed(2)}</span>
                  ) : null}
                </TD>
                <TD className="text-right">
                  <form action={clearManufacturerPromo}>
                    <input type="hidden" name="productId" value={row.id} />
                    <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                      Quitar
                    </Button>
                  </form>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
