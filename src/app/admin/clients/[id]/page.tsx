import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  ensurePrimaryContact,
  createClientAccountMovement,
  toggleClientMovementPaid,
} from "@/server/actions/clients";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ClientFormModal } from "@/components/admin/client-form-modal";
import { ContactFormModal } from "@/components/admin/contact-form-modal";
import { ContactActions } from "@/components/admin/contact-actions";
import { CreatePortalAccess, PortalUserActions } from "@/components/admin/portal-user-actions";
import { ActivityForm } from "@/components/admin/activity-form";
import { ActivityTimeline } from "@/components/admin/activity-timeline";
import { ClientPricingPanel } from "@/components/admin/client-pricing-panel";
import { formatDate, formatUsd } from "@/lib/utils";
async function createMovementForm(formData: FormData) {
  "use server";
  await createClientAccountMovement(formData);
}
async function toggleMovementForm(formData: FormData) {
  "use server";
  await toggleClientMovementPaid(formData);
}
export const metadata = { title: "Admin · Ficha de cliente" };
const requestStatus: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviado",
  IN_REVIEW: "En revisión",
  ANSWERED: "Respondido",
  CONFIRMED: "Confirmado",
  REJECTED: "Rechazado",
  CLOSED: "Cerrado",
};
export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  await requireAdmin();
  const { id } = params;
  await ensurePrimaryContact(id);
  const [client, owners, priceLists, requests, quotes, movements, activities] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true } },
        contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        portalUsers: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true, lastLoginAt: true, isActive: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.priceList.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.customerRequest.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.quote.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      include: { items: { select: { quantity: true, unitPriceUsd: true } } },
    }),
    prisma.accountMovement.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" } }),
    prisma.clientActivity.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
      take: 100,
    }),
  ]);
  if (!client) notFound();
  const balance = movements.reduce(
    (n, m) => n + (m.kind === "DEBIT" ? Number(m.amountUsd) : -Number(m.amountUsd)),
    0,
  );
  const primary = client.contacts.find((x) => x.isPrimary);
  return (
    <div className="space-y-6">
      <Link href="/admin/clients" className="text-sm text-muted-foreground">
        ← Volver a clientes
      </Link>
      <PageHeader
        title={client.companyName}
        description={[
          client.tradeName,
          client.taxId && `CUIT ${client.taxId}`,
          client.owner?.name && `Responsable: ${client.owner.name}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/admin/quotes/new?clientId=${id}`}>Nueva cotización</ButtonLink>
            <ClientFormModal
              client={client}
              owners={owners}
              priceLists={priceLists}
              triggerLabel="Editar"
            />
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        {client.segment ? <Badge>{client.segment}</Badge> : null}
        <Badge tone={client.isActive ? "success" : "muted"}>
          {client.isActive ? "Activo" : "Inactivo"}
        </Badge>
        {client.tags.map((t) => (
          <Badge key={t} tone="accent">
            {t}
          </Badge>
        ))}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-4">
          <Card>
            <CardContent className="space-y-2 p-4">
              <h2 className="font-semibold">Datos de empresa</h2>
              <p className="text-sm">{client.address || "Sin dirección"}</p>
              <p className="text-sm text-muted-foreground">
                {[client.city, client.province, client.country].filter(Boolean).join(", ")}
              </p>
              {client.website ? (
                <a className="text-sm text-primary" href={client.website} target="_blank">
                  {client.website}
                </a>
              ) : null}
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{client.notes}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Contactos</h2>
                <ContactFormModal clientId={id} />
              </div>
              {client.contacts.length ? (
                client.contacts.map((c) => (
                  <div key={c.id} className="rounded border p-3">
                    <div className="flex justify-between">
                      <p className="font-medium">
                        {c.name}
                        {c.isPrimary ? " · Principal" : ""}
                      </p>
                      <ContactFormModal clientId={id} contact={c} />
                    </div>
                    <p className="text-xs text-muted-foreground">{c.role}</p>
                    <p className="text-sm">
                      {c.email || "Sin email"} · {c.phone || c.whatsapp || "Sin teléfono"}
                    </p>
                    <div className="mt-2 flex flex-wrap">
                      <CreatePortalAccess clientId={id} name={c.name} email={c.email} />
                      <ContactActions id={c.id} clientId={id} isPrimary={c.isPrimary} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Sin contactos.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-semibold">Usuarios del portal</h2>
              {client.portalUsers.map((u) => (
                <div key={u.id} className="rounded border p-3">
                  <Link className="font-medium hover:underline" href={`/admin/users/${u.id}`}>
                    {u.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {u.email} ·{" "}
                    {u.lastLoginAt ? `Último acceso ${formatDate(u.lastLoginAt)}` : "Nunca ingresó"}
                  </p>
                  <PortalUserActions id={u.id} clientId={id} isActive={u.isActive} />
                </div>
              ))}
              {!client.portalUsers.length ? (
                <p className="text-sm text-muted-foreground">
                  Este cliente todavía no tiene acceso al portal.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
        <main>
          <Tabs
            syncParam="tab"
            defaultTab={searchParams.tab || "activity"}
            tabs={[
              {
                id: "activity",
                label: "Actividad",
                content: (
                  <div className="space-y-4">
                    <ActivityForm clientId={id} />
                    <ActivityTimeline clientId={id} items={activities} />
                  </div>
                ),
              },
              {
                id: "requests",
                label: "Pedidos",
                content: (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <THead>
                          <TR>
                            <TH>Fecha</TH>
                            <TH>Estado</TH>
                            <TH>Ítems</TH>
                            <TH></TH>
                          </TR>
                        </THead>
                        <TBody>
                          {requests.map((r) => (
                            <TR key={r.id}>
                              <TD>{formatDate(r.createdAt)}</TD>
                              <TD>{requestStatus[r.status] || r.status}</TD>
                              <TD>{r._count.items}</TD>
                              <TD>
                                <Link href={`/admin/requests/${r.id}`}>Ver</Link>
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </CardContent>
                  </Card>
                ),
              },
              {
                id: "quotes",
                label: "Cotizaciones",
                content: (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <THead>
                          <TR>
                            <TH>Número</TH>
                            <TH>Versión</TH>
                            <TH>Estado</TH>
                            <TH>Fecha</TH>
                            <TH>Total</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {quotes.map((q) => (
                            <TR key={q.id}>
                              <TD>
                                <Link href={`/admin/quotes/${q.id}`}>{q.number}</Link>
                              </TD>
                              <TD>{q.version}</TD>
                              <TD>{q.status}</TD>
                              <TD>{formatDate(q.createdAt)}</TD>
                              <TD>
                                {formatUsd(
                                  q.items.reduce(
                                    (n, i) => n + Number(i.unitPriceUsd || 0) * Number(i.quantity),
                                    0,
                                  ),
                                )}
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </CardContent>
                  </Card>
                ),
              },
              {
                id: "account",
                label: "Cuenta corriente",
                content: (
                  <Card>
                    <CardContent className="space-y-4 p-4">
                      <p className="text-lg">
                        Saldo: <strong>{formatUsd(balance)}</strong>
                      </p>
                      <form
                        action={createMovementForm}
                        className="grid gap-2 md:grid-cols-3"
                      >
                        <input type="hidden" name="clientId" value={id} />
                        <Select name="kind">
                          <option value="DEBIT">Débito</option>
                          <option value="CREDIT">Crédito</option>
                        </Select>
                        <Input name="concept" placeholder="Concepto" required />
                        <Input
                          name="amountUsd"
                          type="number"
                          step=".01"
                          placeholder="Monto USD"
                          required
                        />
                        <Input name="dueDate" type="date" />
                        <Select name="referenceId">
                          <option value="">Sin vincular</option>
                          {quotes.map((q) => (
                            <option key={q.id} value={q.id}>
                              Cotización N° {q.number}
                            </option>
                          ))}
                        </Select>
                        <input type="hidden" name="referenceType" value="QUOTE" />
                        <Textarea name="notes" placeholder="Notas" />
                        <Button type="submit">Agregar movimiento</Button>
                      </form>
                      {movements.map((m) => (
                        <div key={m.id} className="rounded border p-3 text-sm">
                          <div className="flex justify-between">
                            <span>
                              {m.concept} · {m.kind === "DEBIT" ? "Débito" : "Crédito"}
                            </span>
                            <strong>{formatUsd(Number(m.amountUsd))}</strong>
                          </div>
                          <p className="text-muted-foreground">
                            {m.notes || "Sin notas"}
                            {m.referenceId
                              ? ` · Referencia ${m.referenceType}: ${m.referenceId}`
                              : ""}
                          </p>
                          <form action={toggleMovementForm}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="clientId" value={id} />
                            <Button size="sm" variant="ghost" type="submit">
                              {m.paidAt ? "Marcar pendiente" : "Marcar pagado"}
                            </Button>
                          </form>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ),
              },
              {
                id: "pricing",
                label: "Precios y visibilidad",
                content: <ClientPricingPanel clientId={id} clientName={client.companyName} />,
              },
            ]}
          />
        </main>
      </div>
    </div>
  );
}
