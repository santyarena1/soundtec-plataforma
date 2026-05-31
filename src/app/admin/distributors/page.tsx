import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { upsertDistributor } from "@/server/actions/admin-catalog";

export const metadata = { title: "Admin · Proveedores" };

export default async function AdminDistributorsPage() {
  await requireAdmin();
  const list = await prisma.distributor.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true, priceLists: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Proveedores" description="Proveedores asociados al catálogo." />

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Nuevo proveedor</h2>
          <form action={upsertDistributor} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name" required>Nombre</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Notas internas</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked />
              Activo
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Crear proveedor</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {list.length === 0 ? (
        <TableEmpty message="Sin proveedores cargados." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Proveedor</TH>
              <TH>Productos</TH>
              <TH>Listas</TH>
              <TH>Estado</TH>
            </TR>
          </THead>
          <TBody>
            {list.map((d) => (
              <TR key={d.id}>
                <TD className="font-medium">{d.name}</TD>
                <TD>{d._count.products}</TD>
                <TD>{d._count.priceLists}</TD>
                <TD>{d.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
