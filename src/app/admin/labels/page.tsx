import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { ConfirmSubmit } from "@/components/ui/confirm-button";
import { upsertLabel, deleteLabel } from "@/server/actions/labels";

export const metadata = { title: "Admin · Etiquetas" };

export default async function AdminLabelsPage() {
  await requireAdmin();
  const labels = await prisma.label.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Etiquetas" description="Etiquetas para clasificar y filtrar productos." />

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Nueva etiqueta</h2>
          <form action={upsertLabel} className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="name" required>Nombre</Label>
              <Input id="name" name="name" required placeholder="Ej. Nuevo" className="w-48" />
            </div>
            <div>
              <Label htmlFor="color">Color</Label>
              <input
                id="color"
                name="color"
                type="color"
                defaultValue="#6366f1"
                className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent p-0.5"
              />
            </div>
            <Button type="submit">Crear etiqueta</Button>
          </form>
        </CardContent>
      </Card>

      {labels.length === 0 ? (
        <TableEmpty message="No hay etiquetas todavía." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Etiqueta</TH>
              <TH>Color</TH>
              <TH>Productos</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {labels.map((l) => (
              <TR key={l.id}>
                <TD className="font-medium">
                  <span
                    className="inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: l.color }}
                  >
                    {l.name}
                  </span>
                </TD>
                <TD>
                  <span className="font-mono text-xs text-muted-foreground">{l.color}</span>
                </TD>
                <TD>{l._count.products}</TD>
                <TD className="text-right space-x-1">
                  <form action={deleteLabel} className="inline">
                    <input type="hidden" name="id" value={l.id} />
                    <ConfirmSubmit confirmMessage={`Eliminar etiqueta "${l.name}"? Se quitará de todos los productos.`}>
                      Eliminar
                    </ConfirmSubmit>
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
