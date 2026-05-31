import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { VisibilityRuleForm } from "@/app/admin/visibility/visibility-rule-form";
import {
  saveClientCommercialConfig,
  createClientAccountMovement,
  toggleClientMovementPaid,
  deleteClientVisibility,
  upsertClientExtraDiscount,
  deleteClientExtraDiscount,
} from "@/server/actions/admin-client-detail";
import { upsertClient } from "@/server/actions/clients";
import { CreatePortalUserForm } from "@/components/admin/create-portal-user-form";
import { formatDate, formatUsd } from "@/lib/utils";

function textoAlcance(scope: string) {
  const map: Record<string, string> = {
    BRAND: "Marca",
    DISTRIBUTOR: "Proveedor",
    CATEGORY: "Categoría",
    FAMILY: "Familia",
    PRODUCT: "Producto",
    GLOBAL: "Global",
    CLIENT: "Cliente",
  };
  return map[scope] || scope;
}

function textoEstadoSolicitud(status: string) {
  const map: Record<string, string> = {
    DRAFT: "Borrador",
    SENT: "Enviada",
    IN_REVIEW: "En revisión",
    ANSWERED: "Respondida",
    CONFIRMED: "Confirmada",
    REJECTED: "Rechazada",
    CLOSED: "Cerrada",
  };
  return map[status] || status;
}

export const metadata = { title: "Admin · Ficha de cliente" };

export default async function AdminClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const [client, priceLists, requests, movements, visibilityRules, discountRules, brands, distributors, categories, families, products] =
    await Promise.all([
      prisma.client.findUnique({
        where: { id },
        include: {
          portalUsers: {
            select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true },
            orderBy: { name: "asc" },
          },
          assignedPriceList: { select: { id: true, name: true } },
        },
      }),
      prisma.priceList.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, currency: true } }),
      prisma.customerRequest.findMany({
        where: { clientId: id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { items: true, messages: true } }, user: { select: { name: true } } },
        take: 50,
      }),
      prisma.accountMovement.findMany({
        where: { clientId: id },
        orderBy: [{ paidAt: "asc" }, { createdAt: "desc" }],
      }),
      prisma.visibilityRule.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" } }),
      prisma.discountRule.findMany({
        where: { clientId: id },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      }),
      prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.productFamily.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.product.findMany({ orderBy: { normalizedName: "asc" }, select: { id: true, normalizedName: true }, take: 500 }),
    ]);

  if (!client) notFound();

  const balance = movements.reduce(
    (acc, m) => acc + (m.kind === "DEBIT" ? Number(m.amountUsd) : -Number(m.amountUsd)),
    0
  );

  const resourceMaps: Record<string, Map<string, string>> = {
    BRAND: new Map(brands.map((b) => [b.id, b.name])),
    DISTRIBUTOR: new Map(distributors.map((d) => [d.id, d.name])),
    CATEGORY: new Map(categories.map((c) => [c.id, c.name])),
    FAMILY: new Map(families.map((f) => [f.id, f.name])),
    PRODUCT: new Map(products.map((p) => [p.id, p.normalizedName])),
  };

  const clientOption = [{ id: client.id, name: client.contactName || client.companyName, companyName: client.companyName }];

  return (
    <div className="space-y-6">
      <Link href="/admin/clients" className="text-sm text-muted-foreground hover:text-foreground">
        ← Volver a clientes
      </Link>

      <PageHeader
        title={client.companyName}
        description={[client.tradeName, client.taxId ? `CUIT ${client.taxId}` : null].filter(Boolean).join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            {client.isActive ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}
          </div>
        }
      />

      <Tabs
        tabs={[
          {
            id: "datos",
            label: "Datos del cliente",
            content: (
              <Card>
                <CardContent className="space-y-4 p-6">
                  <form action={upsertClient} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={client.id} />
                    <div className="sm:col-span-2">
                      <Label htmlFor="companyName" required>Razón social</Label>
                      <Input id="companyName" name="companyName" defaultValue={client.companyName} required />
                    </div>
                    <div>
                      <Label htmlFor="tradeName">Nombre comercial</Label>
                      <Input id="tradeName" name="tradeName" defaultValue={client.tradeName || ""} />
                    </div>
                    <div>
                      <Label htmlFor="taxId">CUIT</Label>
                      <Input id="taxId" name="taxId" defaultValue={client.taxId || ""} />
                    </div>
                    <div>
                      <Label htmlFor="contactName">Contacto</Label>
                      <Input id="contactName" name="contactName" defaultValue={client.contactName || ""} />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" name="email" type="email" defaultValue={client.email || ""} />
                    </div>
                    <div>
                      <Label htmlFor="phone">Teléfono</Label>
                      <Input id="phone" name="phone" defaultValue={client.phone || ""} />
                    </div>
                    <div>
                      <Label htmlFor="assignedPriceListId">Lista de precios</Label>
                      <Select id="assignedPriceListId" name="assignedPriceListId" defaultValue={client.assignedPriceListId || ""}>
                        <option value="">Por defecto</option>
                        {priceLists.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="address">Dirección</Label>
                      <Input id="address" name="address" defaultValue={client.address || ""} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="notes">Notas</Label>
                      <Textarea id="notes" name="notes" rows={3} defaultValue={client.notes || ""} />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="isActive" defaultChecked={client.isActive} />
                      Cliente activo
                    </label>
                    <div className="sm:col-span-2 flex justify-end">
                      <Button type="submit">Guardar datos</Button>
                    </div>
                  </form>

                  <div className="border-t border-border pt-4 space-y-3">
                    <h4 className="text-sm font-semibold">Usuarios de portal</h4>
                    {client.portalUsers.length > 0 && (
                      <ul className="space-y-1 text-sm mb-3">
                        {client.portalUsers.map((u) => (
                          <li key={u.id} className="flex items-center gap-2">
                            <Link href={`/admin/users/${u.id}`} className="text-accent hover:underline">
                              {u.name}
                            </Link>
                            <span className="text-muted-foreground">· {u.email}</span>
                            {!u.isActive && <span className="text-xs text-muted-foreground">(inactivo)</span>}
                            {u.lastLoginAt && (
                              <span className="text-xs text-muted-foreground">
                                Último acceso: {formatDate(u.lastLoginAt)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <CreatePortalUserForm clientId={client.id} />
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "comercial",
            label: "Comercial",
            content: (
              <Card>
                <CardContent className="p-6">
                  <form action={saveClientCommercialConfig} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="clientId" value={client.id} />
                    <div>
                      <Label>Lista de precios</Label>
                      <Select name="assignedPriceListId" defaultValue={client.assignedPriceListId || ""}>
                        <option value="">Por defecto</option>
                        {priceLists.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Notas comerciales</Label>
                      <Textarea name="notes" rows={3} defaultValue={client.notes || ""} />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <Button type="submit" size="sm">
                        Guardar comercial
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "cuenta",
            label: "Cuenta corriente",
            content: (
              <Card>
                <CardContent className="space-y-4 p-6">
                  <p className="text-sm">
                    Saldo: <strong>{formatUsd(balance)}</strong>
                  </p>
                  <form action={createClientAccountMovement} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <input type="hidden" name="clientId" value={client.id} />
                    <div>
                      <Label>Tipo</Label>
                      <Select name="kind" defaultValue="DEBIT">
                        <option value="DEBIT">Débito</option>
                        <option value="CREDIT">Crédito</option>
                      </Select>
                    </div>
                    <div className="lg:col-span-2">
                      <Label>Concepto</Label>
                      <Input name="concept" required />
                    </div>
                    <div>
                      <Label>Monto USD</Label>
                      <Input name="amountUsd" type="number" min={0.01} step="0.01" required />
                    </div>
                    <div>
                      <Label>Vencimiento</Label>
                      <Input name="dueDate" type="date" />
                    </div>
                    <div className="lg:col-span-5 flex justify-end">
                      <Button type="submit" size="sm">
                        Agregar movimiento
                      </Button>
                    </div>
                  </form>
                  {movements.length === 0 ? (
                    <TableEmpty />
                  ) : (
                    <Table>
                      <TBody>
                        {movements.map((m) => (
                          <TR key={m.id}>
                            <TD>{formatDate(m.createdAt)}</TD>
                            <TD>{m.kind === "DEBIT" ? "Débito" : "Crédito"}</TD>
                            <TD>{m.concept}</TD>
                            <TD className="text-right">{formatUsd(Number(m.amountUsd))}</TD>
                            <TD>
                              <form action={toggleClientMovementPaid}>
                                <input type="hidden" name="id" value={m.id} />
                                <input type="hidden" name="clientId" value={client.id} />
                                <Button type="submit" variant="ghost" size="sm">
                                  {m.paidAt ? "Pagado" : "Pendiente"}
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
            ),
          },
          {
            id: "visibilidad",
            label: "Visibilidad",
            content: (
              <Card>
                <CardContent className="space-y-4 p-6">
                  <VisibilityRuleForm
                    defaultClientId={client.id}
                    clients={clientOption}
                    brands={brands}
                    distributors={distributors}
                    categories={categories}
                    families={families}
                    products={products.map((p) => ({ id: p.id, name: p.normalizedName }))}
                  />
                  <div className="space-y-1">
                    {visibilityRules.map((r) => (
                      <div key={r.id} className="flex justify-between rounded border px-3 py-2 text-sm">
                        <span>
                          <Badge tone="primary">{textoAlcance(r.scopeType)}</Badge>{" "}
                          {r.scopeId ? resourceMaps[r.scopeType]?.get(r.scopeId) : "—"}
                        </span>
                        <form action={deleteClientVisibility}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="clientId" value={client.id} />
                          <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                            Eliminar
                          </Button>
                        </form>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "descuentos",
            label: "Descuentos",
            content: (
              <Card>
                <CardContent className="space-y-4 p-6">
                  <form action={upsertClientExtraDiscount} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="clientId" value={client.id} />
                    <div className="sm:col-span-2">
                      <Label>Nombre</Label>
                      <Input name="name" required />
                    </div>
                    <div>
                      <Label>Alcance</Label>
                      <Select name="scopeType" defaultValue="GLOBAL">
                        <option value="GLOBAL">Global</option>
                        <option value="BRAND">Marca</option>
                        <option value="CATEGORY">Categoría</option>
                        <option value="PRODUCT">Producto</option>
                      </Select>
                    </div>
                    <div>
                      <Label>Descuento %</Label>
                      <Input name="discountPercent" type="number" min={0} max={100} required />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <Button type="submit" size="sm">
                        Agregar
                      </Button>
                    </div>
                  </form>
                  {discountRules.map((d) => (
                    <div key={d.id} className="flex justify-between rounded border px-3 py-2 text-sm">
                      <span>
                        {d.name} · {Number(d.discountPercent).toFixed(1)}%
                      </span>
                      <form action={deleteClientExtraDiscount}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="clientId" value={client.id} />
                        <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                          Eliminar
                        </Button>
                      </form>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ),
          },
          {
            id: "historial",
            label: "Solicitudes",
            content: (
              <Card>
                <CardContent className="p-6">
                  {requests.length === 0 ? (
                    <TableEmpty message="Sin solicitudes de este cliente." />
                  ) : (
                    <Table>
                      <THead>
                        <TR>
                          <TH>Fecha</TH>
                          <TH>Usuario</TH>
                          <TH>Estado</TH>
                          <TH></TH>
                        </TR>
                      </THead>
                      <TBody>
                        {requests.map((r) => (
                          <TR key={r.id}>
                            <TD>{formatDate(r.createdAt)}</TD>
                            <TD>{r.user.name}</TD>
                            <TD>{textoEstadoSolicitud(r.status)}</TD>
                            <TD>
                              <Link href={`/admin/requests/${r.id}`} className="text-accent hover:underline">
                                Ver
                              </Link>
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
