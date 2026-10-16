import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canSeeCosts, permissionsHave } from "@/lib/permissions";
import { ensurePrimaryContact, createClientAccountMovement, toggleClientMovementPaid } from "@/server/actions/clients";
import { canAccessClient } from "@/server/clients/access";
import { conditionsGroupId } from "@/server/clients/conditions";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Input, Select, Textarea } from "@/components/ui/input";
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

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const ctx = await requireStaff(["clients.view", "clients.view_all"]);
  const { id } = params;
  if (!(await canAccessClient(ctx, id))) redirect("/admin/clients");
  const can = (s: Parameters<typeof permissionsHave>[1]) => permissionsHave(ctx.permissions, s);
  const seesCosts = canSeeCosts(ctx.permissions);
  const canContacts = can("clients.contacts") || can("clients.edit");
  const canPortal = can("clients.portal_users");
  const canCommercial = can("clients.commercial");
  const seesAllQuotes = can("quotes.view_all");

  await ensurePrimaryContact(id);
  const [client, requests, quotes, movements, activities, discounts, otherDiscounts] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true } },
        assignedPriceList: { select: { name: true } },
        contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        portalUsers: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true, lastLoginAt: true, isActive: true, mustChangePassword: true },
        },
      },
    }),
    can("requests.view")
      ? prisma.customerRequest.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, include: { _count: { select: { items: true } } } })
      : Promise.resolve([]),
    can("quotes.view_own")
      ? prisma.quote.findMany({
          where: { clientId: id, ...(seesAllQuotes ? {} : { ownerId: ctx.user.id }) },
          orderBy: { createdAt: "desc" },
          include: { items: { select: { quantity: true, unitPriceUsd: true } } },
        })
      : Promise.resolve([]),
    can("clients.account") ? prisma.accountMovement.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    prisma.clientActivity.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } }, take: 100 }),
    prisma.discountRule.findMany({ where: { groupId: conditionsGroupId(id), isActive: true }, orderBy: { priority: "desc" } }),
    prisma.discountRule.count({ where: { clientId: id, isActive: true, NOT: { groupId: conditionsGroupId(id) } } }),
  ]);
  if (!client) notFound();

  const [brandNames, categoryNames] = await Promise.all([
    prisma.brand.findMany({ where: { id: { in: discounts.filter((d) => d.scopeType === "BRAND" && d.scopeId).map((d) => d.scopeId!) } }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { id: { in: discounts.filter((d) => d.scopeType === "CATEGORY" && d.scopeId).map((d) => d.scopeId!) } }, select: { id: true, name: true } }),
  ]);
  const nameOf = (scope: string, sid: string | null) =>
    scope === "BRAND" ? brandNames.find((b) => b.id === sid)?.name ?? "marca" : scope === "CATEGORY" ? categoryNames.find((c) => c.id === sid)?.name ?? "categoría" : "todo el catálogo";

  const balance = movements.reduce((n, m) => n + (m.kind === "DEBIT" ? Number(m.amountUsd) : -Number(m.amountUsd)), 0);
  const portalEmails = new Set(client.portalUsers.map((u) => u.email.toLowerCase()));
  const location = [client.address, [client.postalCode, client.city].filter(Boolean).join(" "), client.province, client.country].filter(Boolean).join(", ");

  const tabs = [
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
    ...(can("requests.view")
      ? [
          {
            id: "requests",
            label: `Pedidos (${requests.length})`,
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
        ]
      : []),
    ...(can("quotes.view_own")
      ? [
          {
            id: "quotes",
            label: `Cotizaciones (${quotes.length})`,
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
                          <TD>{formatUsd(q.items.reduce((n, i) => n + Number(i.unitPriceUsd || 0) * Number(i.quantity), 0))}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>
            ),
          },
        ]
      : []),
    ...(can("clients.account")
      ? [
          {
            id: "account",
            label: "Cuenta corriente",
            content: (
              <Card>
                <CardContent className="space-y-4 p-4">
                  <p className="text-lg">
                    Saldo: <strong>{formatUsd(balance)}</strong>
                    {client.creditLimitUsd != null ? (
                      <span className="ml-2 text-sm text-muted-foreground">
                        · Límite {formatUsd(Number(client.creditLimitUsd))}
                        {balance > Number(client.creditLimitUsd) ? <Badge tone="destructive" className="ml-2">Superado</Badge> : null}
                      </span>
                    ) : null}
                  </p>
                  <form action={createMovementForm} className="grid gap-2 md:grid-cols-3">
                    <input type="hidden" name="clientId" value={id} />
                    <Select name="kind">
                      <option value="DEBIT">Débito</option>
                      <option value="CREDIT">Crédito</option>
                    </Select>
                    <Input name="concept" placeholder="Concepto" required />
                    <Input name="amountUsd" type="number" step=".01" placeholder="Monto USD" required />
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
                        {m.referenceId ? ` · Referencia ${m.referenceType}: ${m.referenceId}` : ""}
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
        ]
      : []),
    // Reglas avanzadas (márgenes, descuentos por producto, visibilidad): solo con acceso a costos.
    ...(seesCosts
      ? [{ id: "pricing", label: "Precios y visibilidad", content: <ClientPricingPanel clientId={id} clientName={client.companyName} /> }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <Link href="/admin/clients" className="text-sm text-muted-foreground">
        ← Volver a clientes
      </Link>
      <PageHeader
        title={client.companyName}
        description={[client.tradeName, client.taxId && `CUIT ${client.taxId}`, client.taxCondition, client.owner?.name && `Responsable: ${client.owner.name}`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex flex-wrap gap-2">
            {can("quotes.create") ? <ButtonLink href={`/admin/quotes/new?clientId=${id}`}>Nueva cotización</ButtonLink> : null}
            {can("clients.edit") ? (
              <ButtonLink href={`/admin/clients/${id}/editar`} variant="outline">
                Editar
              </ButtonLink>
            ) : null}
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        {client.segment ? <Badge>{client.segment}</Badge> : null}
        <Badge tone={client.isActive ? "success" : "muted"}>{client.isActive ? "Activo" : "Inactivo"}</Badge>
        {client.tags.map((t) => (
          <Badge key={t} tone="accent">
            {t}
          </Badge>
        ))}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-4">
          <Card>
            <CardContent className="space-y-2 p-4">
              <h2 className="font-semibold">Empresa</h2>
              <p className="text-sm">{location || "Sin dirección"}</p>
              {client.website ? (
                <a className="text-sm text-primary" href={client.website} target="_blank" rel="noreferrer">
                  {client.website}
                </a>
              ) : null}
              {client.source ? <p className="text-xs text-muted-foreground">Llegó por: {client.source}</p> : null}
              {client.notes ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{client.notes}</p> : null}
            </CardContent>
          </Card>

          {canCommercial || seesCosts ? (
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Condiciones comerciales</h2>
                  {canCommercial && can("clients.edit") ? (
                    <Link href={`/admin/clients/${id}/editar`} className="text-xs text-primary hover:underline">
                      Editar
                    </Link>
                  ) : null}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Pago</dt>
                  <dd>{client.paymentTerms || "—"}</dd>
                  <dt className="text-muted-foreground">Crédito</dt>
                  <dd>{client.creditLimitUsd != null ? formatUsd(Number(client.creditLimitUsd)) : "Sin límite"}</dd>
                  <dt className="text-muted-foreground">Lista</dt>
                  <dd>{client.assignedPriceList?.name ?? "Predeterminada"}</dd>
                </dl>
                <div className="pt-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Descuentos</p>
                  {discounts.length ? (
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {discounts.map((d) => (
                        <li key={d.id}>
                          <span className="font-semibold">{Number(d.discountPercent)} %</span> en {nameOf(d.scopeType, d.scopeId)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Precio de venta general.</p>
                  )}
                  {otherDiscounts ? <p className="mt-1 text-xs text-muted-foreground">+ {otherDiscounts} regla(s) avanzadas.</p> : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Contactos</h2>
                {canContacts ? <ContactFormModal clientId={id} /> : null}
              </div>
              {client.contacts.length ? (
                client.contacts.map((c) => {
                  const hasAccess = c.email ? portalEmails.has(c.email.toLowerCase()) : false;
                  return (
                    <div key={c.id} className="rounded border p-3">
                      <div className="flex justify-between gap-2">
                        <p className="font-medium">
                          {c.name}
                          {c.isPrimary ? <span className="ml-1 text-xs text-muted-foreground">· Principal</span> : null}
                        </p>
                        {canContacts ? <ContactFormModal clientId={id} contact={c} /> : null}
                      </div>
                      {c.role ? <p className="text-xs text-muted-foreground">{c.role}</p> : null}
                      <p className="text-sm">{c.email || "Sin email"}</p>
                      <p className="text-sm text-muted-foreground">{[c.phone, c.whatsapp && `WhatsApp ${c.whatsapp}`].filter(Boolean).join(" · ") || "Sin teléfono"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {hasAccess ? <Badge tone="success">Con acceso al portal</Badge> : canPortal ? <CreatePortalAccess clientId={id} name={c.name} email={c.email} phone={c.phone ?? c.whatsapp} /> : null}
                        {canContacts ? <ContactActions id={c.id} clientId={id} isPrimary={c.isPrimary} /> : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">Sin contactos.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-semibold">Accesos al portal</h2>
              {client.portalUsers.map((u) => (
                <div key={u.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {can("users.view") ? (
                      <Link className="font-medium hover:underline" href={`/admin/users/${u.id}`}>
                        {u.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{u.name}</span>
                    )}
                    {!u.isActive ? <Badge tone="muted">Inactivo</Badge> : null}
                    {u.mustChangePassword ? <Badge tone="warning">clave temporal</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {u.email} · {u.lastLoginAt ? `Último acceso ${formatDate(u.lastLoginAt)}` : "Nunca ingresó"}
                  </p>
                  {canPortal ? <PortalUserActions id={u.id} clientId={id} isActive={u.isActive} email={u.email} name={u.name} /> : null}
                </div>
              ))}
              {!client.portalUsers.length ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no tiene acceso al portal.{canPortal ? " Dáselo desde un contacto con email." : ""}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
        <main>
          <Tabs syncParam="tab" defaultTab={searchParams.tab || "activity"} tabs={tabs} />
        </main>
      </div>
    </div>
  );
}
