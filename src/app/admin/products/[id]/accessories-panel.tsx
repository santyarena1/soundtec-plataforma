import { Card, CardContent } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { upsertAccessoryRelation, deleteAccessoryRelation } from "@/server/actions/accessories";
import { ConfirmSubmit } from "@/components/ui/confirm-button";

interface ProductRef {
  id: string;
  normalizedName: string;
  internalSku: string | null;
  kind: "PRINCIPAL" | "ACCESORIO";
}

interface RelationItem {
  id: string;
  isRequired: boolean;
  accessoryProduct: ProductRef;
}

interface Props {
  productId: string;
  relations: RelationItem[];
  candidates: ProductRef[];
}

export function AccessoriesPanel({ productId, relations, candidates }: Props) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="heading-3">Accesorios vinculados</h2>
          <p className="text-xs text-muted-foreground">
            Definí qué accesorios son compatibles con este producto principal y si son obligatorios.
          </p>
        </div>

        <form action={upsertAccessoryRelation} className="grid gap-3 rounded-md border border-border bg-secondary/40 p-3 sm:grid-cols-3">
          <input type="hidden" name="productId" value={productId} />
          <div className="sm:col-span-2">
            <Label htmlFor="accessoryProductId" required>Producto accesorio</Label>
            <Select id="accessoryProductId" name="accessoryProductId" required>
              <option value="">Seleccionar accesorio</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.normalizedName} {p.internalSku ? `(${p.internalSku})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" name="isRequired" />
            Accesorio obligatorio
          </label>
          <div className="sm:col-span-3 flex justify-end">
            <Button type="submit" size="sm">Vincular accesorio</Button>
          </div>
        </form>

        {relations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin accesorios vinculados.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Accesorio</TH>
                <TH>SKU</TH>
                <TH>Tipo</TH>
                <TH>Obligatorio</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {relations.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.accessoryProduct.normalizedName}</TD>
                  <TD>{r.accessoryProduct.internalSku || "—"}</TD>
                  <TD>
                    <Badge tone={r.accessoryProduct.kind === "ACCESORIO" ? "warning" : "muted"}>
                      {r.accessoryProduct.kind === "ACCESORIO" ? "Accesorio" : "Principal"}
                    </Badge>
                  </TD>
                  <TD>{r.isRequired ? "Sí" : "No"}</TD>
                  <TD className="text-right">
                    <form action={deleteAccessoryRelation}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="productId" value={productId} />
                      <ConfirmSubmit confirmMessage="¿Eliminar vínculo de accesorio?">Eliminar</ConfirmSubmit>
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
