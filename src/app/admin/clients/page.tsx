import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { upsertClient, toggleClientActive } from "@/server/actions/clients";
import { formatDate } from "@/lib/utils";
import { Building2 } from "lucide-react";

export const metadata = { title: "Admin · Clientes" };

export default async function AdminClientsPage() {
  await requireAdmin();
  const [clients, priceLists] = await Promise.all([
    prisma.client.findMany({
      orderBy: { companyName: "asc" },
      include: {
        _count: { select: { portalUsers: true, requests: true } },
        assignedPriceList: { select: { name: true } },
      },
    }),
    prisma.priceList.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Empresas y cuentas comerciales. Acá configurás precios, visibilidad y cuenta corriente. Los usuarios de portal se vinculan desde Usuarios."
        actions={
          <ButtonLink href="/admin/users" variant="outline">
            Gestionar usuarios de acceso
          </ButtonLink>
        }
      />

      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="heading-3">Nuevo cliente comercial</h2>
          </div>
          <form action={upsertClient} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="companyName" required>Razón social / empresa</Label>
              <Input id="companyName" name="companyName" required placeholder="Ej. Integrador Audiovisual S.A." />
            </div>
            <div>
              <Label htmlFor="tradeName">Nombre comercial</Label>
              <Input id="tradeName" name="tradeName" />
            </div>
            <div>
              <Label htmlFor="taxId">CUIT</Label>
              <Input id="taxId" name="taxId" placeholder="30-12345678-9" />
            </div>
            <div>
              <Label htmlFor="contactName">Contacto principal</Label>
              <Input id="contactName" name="contactName" />
            </div>
            <div>
              <Label htmlFor="email">Email comercial</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" />
            </div>
            <div>
              <Label htmlFor="assignedPriceListId">Lista de precios</Label>
              <Select id="assignedPriceListId" name="assignedPriceListId" defaultValue="">
                <option value="">Por defecto del sistema</option>
                {priceLists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" name="address" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Notas internas</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked />
              Cliente activo
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Crear cliente</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <TableEmpty message="No hay clientes cargados. Creá el primero arriba." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Empresa</TH>
                  <TH>Contacto</TH>
                  <TH>Lista de precios</TH>
                  <TH>Usuarios portal</TH>
                  <TH>Solicitudes</TH>
                  <TH>Estado</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {clients.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/admin/clients/${c.id}`} className="font-medium hover:underline">
                        {c.companyName}
                      </Link>
                      {c.tradeName ? (
                        <p className="text-xs text-muted-foreground">{c.tradeName}</p>
                      ) : null}
                    </TD>
                    <TD className="text-sm">
                      {c.contactName || "—"}
                      {c.email ? <p className="text-xs text-muted-foreground">{c.email}</p> : null}
                    </TD>
                    <TD className="text-sm">{c.assignedPriceList?.name || "Por defecto"}</TD>
                    <TD>{c._count.portalUsers}</TD>
                    <TD>{c._count.requests}</TD>
                    <TD>{c.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}</TD>
                    <TD className="text-right">
                      <form action={toggleClientActive} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {c.isActive ? "Desactivar" : "Activar"}
                        </Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
