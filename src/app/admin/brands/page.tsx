import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { upsertBrand, deleteBrand } from "@/server/actions/admin-catalog";
import { ConfirmSubmit } from "@/components/ui/confirm-button";
import { BrandDetailPanel } from "./brand-detail-panel";

export const metadata = { title: "Admin · Marcas" };

export default async function AdminBrandsPage() {
  await requireAdmin();
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { products: true } },
      products: {
        orderBy: { normalizedName: "asc" },
        take: 200,
        select: { id: true, normalizedName: true, internalSku: true, isActive: true, kind: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Marcas" description="Marcas con las que opera Soundtec." />

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Crear marca</h2>
          <form action={upsertBrand} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name" required>Nombre</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="logoUrl">URL del logo</Label>
              <Input id="logoUrl" name="logoUrl" type="url" placeholder="https://..." />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" name="description" rows={2} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked />
              Marca activa
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Crear marca</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {brands.length === 0 ? (
        <TableEmpty message="Todavía no hay marcas." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Marca</TH>
              <TH>Productos</TH>
              <TH>Estado</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {brands.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium">{b.name}</TD>
                <TD>{b._count.products}</TD>
                <TD>
                  {b.isActive ? <Badge tone="success">Activa</Badge> : <Badge tone="muted">Inactiva</Badge>}
                </TD>
                <TD className="text-right space-x-1">
                  <BrandDetailPanel brand={b} />
                  <form action={deleteBrand} className="inline">
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmSubmit confirmMessage={`Eliminar la marca "${b.name}"? Los productos vinculados se quedan sin marca.`}>
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
