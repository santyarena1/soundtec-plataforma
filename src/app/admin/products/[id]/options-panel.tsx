import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { upsertProductOption, deleteProductOption } from "@/server/actions/product-options";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmit } from "@/components/ui/confirm-button";

interface Option {
  id: string;
  name: string;
  type: string;
  values: unknown;
  priceDeltaUsd: unknown;
  isRequired: boolean;
}

interface Props {
  productId: string;
  options: Option[];
}

export function ProductOptionsPanel({ productId, options }: Props) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="heading-3">Opcionales / accesorios</h2>
          <p className="text-xs text-muted-foreground">
            Si el producto admite configuración, definí las opciones acá. Al guardar la primera, el producto pasa a personalizable.
          </p>
        </div>

        {options.length > 0 ? (
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Tipo</TH>
                <TH>Valores</TH>
                <TH className="text-right">Δ USD</TH>
                <TH>Obligatorio</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {options.map((o) => {
                const values = Array.isArray(o.values) ? (o.values as unknown[]).map(String).join(", ") : "";
                const delta = o.priceDeltaUsd == null ? null : Number(o.priceDeltaUsd);
                return (
                  <TR key={o.id}>
                    <TD className="font-medium">{o.name}</TD>
                    <TD className="text-muted-foreground">{o.type}</TD>
                    <TD className="text-muted-foreground">{values || "—"}</TD>
                    <TD className="text-right">{delta != null ? delta.toFixed(2) : "—"}</TD>
                    <TD>{o.isRequired ? <Badge tone="warning">Sí</Badge> : <Badge tone="muted">No</Badge>}</TD>
                    <TD className="text-right">
                      <form action={deleteProductOption}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="productId" value={productId} />
                        <ConfirmSubmit confirmMessage={`Eliminar la opción "${o.name}"?`}>Eliminar</ConfirmSubmit>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Sin opciones configuradas.</p>
        )}

        <form action={upsertProductOption} className="grid gap-3 rounded-md border border-border bg-secondary/40 p-3 sm:grid-cols-2">
          <input type="hidden" name="productId" value={productId} />
          <div>
            <Label htmlFor="optName" required>Nombre de la opción</Label>
            <Input id="optName" name="name" required placeholder="Ej. Color, Largo de cable, Adaptador" />
          </div>
          <div>
            <Label htmlFor="optType">Tipo</Label>
            <select id="optType" name="type" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm" defaultValue="select">
              <option value="select">Selección única</option>
              <option value="boolean">Sí / No</option>
              <option value="number">Número</option>
              <option value="text">Texto</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="optValues">Valores posibles</Label>
            <Input id="optValues" name="values" placeholder="Separar por coma o salto de línea. Ej: Negro, Blanco, 5m, 10m" />
          </div>
          <div>
            <Label htmlFor="optDelta">Diferencia de precio USD</Label>
            <Input id="optDelta" name="priceDeltaUsd" type="number" step="0.01" placeholder="0.00" />
          </div>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" name="isRequired" />
            Es obligatoria
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" size="sm">Agregar opción</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
