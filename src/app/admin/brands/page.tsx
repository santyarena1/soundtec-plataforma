import { requireStaff } from "@/lib/auth-helpers";
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
import { NormalizeLogosButton } from "./normalize-logos-button";
import { brandLogoSrc } from "@/lib/brand-logo";
import { toggleBrandCatalogVisibility } from "@/server/actions/brand-logos";
import { toggleBrandComingSoon } from "@/server/actions/brand-listing";
import { UnsavedArea } from "@/components/unsaved-guard/unsaved-area";
import { BrandLayoutEditor } from "./brand-layout-editor";
import { loadBrandGroups } from "@/server/catalog/brand-layout";

export const metadata = { title: "Admin · Marcas" };

export default async function AdminBrandsPage() {
  await requireStaff("brands.manage");
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
  const brandLayout = await loadBrandGroups();
  // Para el menú: las marcas que se ven en el catálogo.
  const layoutBrandNames = brands.filter((b) => b.isActive && !b.hiddenFromCatalog).map((b) => b.name);

  return (
    <div className="space-y-6">
      <PageHeader title="Marcas" description="Marcas con las que opera Soundtec." actions={<NormalizeLogosButton />} />

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Crear marca</h2>
          <UnsavedArea>
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
          </UnsavedArea>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3">Grupos de marcas del catálogo</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Cada fila es un grupo: la primera marca es la principal y las demás, sus hermanas. El orden de la lista es el orden en
            el catálogo. Con esto se arman solos el menú de marcas (grupo de 2: caja compartida; de 3 o más: caja ancha; de 1:
            caja suelta) y la barra de arriba del listado (solo la principal, que despliega a sus hermanas). Las marcas sin grupo
            van al final, en «Más marcas». En cursiva: todavía no está cargada y se muestra como «Próximamente».
          </p>
          <BrandLayoutEditor initial={brandLayout.config} brandNames={layoutBrandNames} />
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
              <TH>Catálogo</TH>
              <TH title="La tarjeta dice «Próximamente» y al entrar se avisa que el lineup está en camino">Próximamente</TH>
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
                <TD>
                  <form action={toggleBrandCatalogVisibility.bind(null, b.id)} className="flex items-center gap-2">
                    {b.hiddenFromCatalog ? <Badge tone="warning">Oculta</Badge> : <Badge tone="success">Visible</Badge>}
                    <button type="submit" className="text-xs font-medium text-primary hover:underline">
                      {b.hiddenFromCatalog ? "Mostrar" : "Ocultar"}
                    </button>
                  </form>
                </TD>
                <TD>
                  <form action={toggleBrandComingSoon.bind(null, b.id)} className="flex items-center gap-2">
                    {b.comingSoon ? <Badge tone="accent">Próximamente</Badge> : <Badge tone="muted">No</Badge>}
                    <button type="submit" className="text-xs font-medium text-primary hover:underline">
                      {b.comingSoon ? "Quitar" : "Marcar"}
                    </button>
                  </form>
                </TD>
                <TD className="text-right space-x-1">
                  <BrandDetailPanel brand={{ ...b, logoUrl: brandLogoSrc(b) }} />
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
