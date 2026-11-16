import Link from "next/link";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth-helpers";
import { permissionsHave } from "@/lib/permissions";
import { ButtonLink } from "@/components/ui/button";
import { clientsWhereFor, seesAllClients } from "@/server/clients/access";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClientRowActions } from "@/components/admin/client-row-actions";
import { formatDateShort } from "@/lib/utils";
import { clientPortalSummary } from "@/lib/clients/portal-status";
export const metadata = { title: "Admin · Clientes" };
type Search = {
  q?: string;
  status?: string;
  segment?: string;
  owner?: string;
  portal?: string;
  inactive?: string;
  page?: string;
  size?: string;
  nuevo?: string;
};
export default async function Page({ searchParams }: { searchParams: Search }) {
  const ctx = await requireStaff(["clients.view", "clients.view_all"]);
  if (searchParams.nuevo) redirect("/admin/clients/nuevo");
  const scope = clientsWhereFor(ctx);
  const seesAll = seesAllClients(ctx.permissions);
  const canCreate = permissionsHave(ctx.permissions, "clients.create");
  const canEdit = permissionsHave(ctx.permissions, "clients.edit");
  const canDelete = permissionsHave(ctx.permissions, "clients.delete");
  const canReview = permissionsHave(ctx.permissions, "account_requests.review");
  const now = new Date();
  const pendingInvite = { activationTokens: { some: { usedAt: null, expiresAt: { gt: now } } } };
  const q = searchParams.q?.trim(),
    size = searchParams.size === "50" ? 50 : 25,
    page = Math.max(1, Number(searchParams.page) || 1),
    days = searchParams.inactive ? Number(searchParams.inactive) : 0,
    cutoff = days ? new Date(Date.now() - days * 86400000) : null;
  const where: Prisma.ClientWhereInput = {
    ...scope,
    ...(q
      ? {
          OR: [
            { companyName: { contains: q, mode: "insensitive" } },
            { tradeName: { contains: q, mode: "insensitive" } },
            { taxId: { contains: q, mode: "insensitive" } },
            { contactName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            {
              contacts: {
                some: {
                  OR: [
                    { name: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
    ...(searchParams.status ? { isActive: searchParams.status === "active" } : {}),
    ...(searchParams.segment ? { segment: searchParams.segment } : {}),
    ...(searchParams.owner && seesAll ? { ownerId: searchParams.owner } : {}),
    ...(searchParams.portal === "none" ? { portalUsers: { none: {} } } : {}),
    ...(searchParams.portal === "with" ? { portalUsers: { some: { isActive: true } } } : {}),
    ...(searchParams.portal === "invited" ? { portalUsers: { some: { isActive: true, ...pendingInvite } } } : {}),
    ...(cutoff ? { OR: [{ lastActivityAt: { lt: cutoff } }, { lastActivityAt: null }] } : {}),
  };
  const [clients, total, owners, segments, totalActive, withPortal, invitedClients, pendingRequests] =
    await Promise.all([
      prisma.client.findMany({
        where,
        skip: (page - 1) * size,
        take: size,
        orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
        include: {
          owner: { select: { name: true } },
          contacts: { where: { isPrimary: true }, take: 1 },
          portalUsers: {
            select: {
              isActive: true,
              lastLoginAt: true,
              mustChangePassword: true,
              activationTokens: { where: { usedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { expiresAt: true } },
            },
          },
          _count: { select: { portalUsers: true, requests: true, quotes: true, accountMovements: true } },
        },
      }),
      prisma.client.count({ where }),
      prisma.user.findMany({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN", "STAFF"] }, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.client.findMany({
        where: { ...scope, segment: { not: null } },
        distinct: ["segment"],
        select: { segment: true },
        orderBy: { segment: "asc" },
      }),
      prisma.client.count({ where: { ...scope, isActive: true } }),
      prisma.client.count({ where: { ...scope, portalUsers: { some: { isActive: true } } } }),
      prisma.client.count({ where: { ...scope, portalUsers: { some: { isActive: true, ...pendingInvite } } } }),
      canReview ? prisma.accountRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
    ]);
  const filtered = Boolean(q || searchParams.status || searchParams.segment || searchParams.owner || searchParams.portal || searchParams.inactive);
  const pages = Math.max(1, Math.ceil(total / size));
  const stats: Array<{ value: number; label: string; href: string; highlight?: boolean }> = [
    { value: totalActive, label: "Clientes activos", href: "/admin/clients?status=active" },
    { value: withPortal, label: "Con acceso al portal", href: "/admin/clients?portal=with" },
    { value: invitedClients, label: "Invitados que todavía no crearon su clave", href: "/admin/clients?portal=invited" },
    ...(canReview ? [{ value: pendingRequests, label: "Solicitudes de cuenta por revisar", href: "/admin/account-requests", highlight: pendingRequests > 0 }] : []),
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Empresas, sus personas y quién entra al portal."
        actions={
          canCreate ? (
            <ButtonLink href="/admin/clients/nuevo" data-tour="clients-new-btn">
              Nuevo cliente
            </ButtonLink>
          ) : null
        }
      />
      <div className={`grid gap-3 sm:grid-cols-2 ${stats.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className={`h-full transition-shadow hover:shadow-elevated ${s.highlight ? "border-warning/50 bg-warning/5" : ""}`}>
              <CardContent className="p-4">
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-center gap-2">
            <Input name="q" defaultValue={q} placeholder="Empresa, CUIT, persona o email" className="min-w-[16rem] flex-[2]" />
            <Select name="portal" defaultValue={searchParams.portal || ""} className="w-auto min-w-[11rem] flex-1">
              <option value="">Portal: todos</option>
              <option value="with">Con acceso</option>
              <option value="invited">Invitados sin clave</option>
              <option value="none">Sin acceso</option>
            </Select>
            <Select name="status" defaultValue={searchParams.status || ""} className="w-auto min-w-[9rem] flex-1">
              <option value="">Activas e inactivas</option>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
            </Select>
            {seesAll ? (
              <Select name="owner" defaultValue={searchParams.owner || ""} className="w-auto min-w-[11rem] flex-1">
                <option value="">Todos los responsables</option>
                {owners.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <details className="relative">
              <summary className="flex h-10 cursor-pointer list-none items-center rounded-md border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground">
                Más filtros
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-64 space-y-2 rounded-md border border-border bg-card p-3 shadow-elevated">
                <Select name="segment" defaultValue={searchParams.segment || ""}>
                  <option value="">Todos los rubros</option>
                  {segments.map((x) => x.segment && <option key={x.segment}>{x.segment}</option>)}
                </Select>
                <Select name="inactive" defaultValue={searchParams.inactive || ""}>
                  <option value="">Cualquier actividad</option>
                  <option value="30">Sin actividad hace +30 días</option>
                  <option value="90">Sin actividad hace +90 días</option>
                </Select>
                <Select name="size" defaultValue={String(size)}>
                  <option value="25">25 por página</option>
                  <option value="50">50 por página</option>
                </Select>
              </div>
            </details>
            <button className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">Buscar</button>
            {filtered ? (
              <Link href="/admin/clients" className="px-1 text-sm text-muted-foreground hover:underline">
                Limpiar
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          {!clients.length ? (
            <TableEmpty
              message={
                filtered
                  ? "No hay clientes con esos filtros."
                  : canCreate
                    ? "Todavía no tenés clientes. Cargá el primero con «Nuevo cliente»."
                    : "Todavía no tenés clientes a cargo."
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Empresa</TH>
                  <TH>Contacto principal</TH>
                  <TH>Acceso al portal</TH>
                  {seesAll ? <TH>Responsable</TH> : null}
                  <TH className="text-right">Pedidos</TH>
                  <TH>Última actividad</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {clients.map((c) => {
                  const contact = c.contacts[0];
                  const portal = clientPortalSummary(
                    c.portalUsers.map((u) => ({ ...u, pendingToken: u.activationTokens[0] ?? null })),
                    now
                  );
                  return (
                    <TR key={c.id} className={c.isActive ? "" : "opacity-60"}>
                      <TD className="min-w-[14rem]">
                        <Link className="font-medium hover:underline" href={`/admin/clients/${c.id}`}>
                          {c.companyName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {[c.tradeName, c.segment].filter(Boolean).join(" · ")}
                          {!c.isActive ? (
                            <Badge tone="muted" className="ml-1">
                              Inactiva
                            </Badge>
                          ) : null}
                        </p>
                      </TD>
                      <TD className="min-w-[12rem]">
                        {contact?.name || c.contactName || "—"}
                        <p className="max-w-[16rem] truncate text-xs text-muted-foreground" title={contact?.email || c.email || undefined}>{contact?.email || c.email}</p>
                      </TD>
                      <TD className="whitespace-nowrap">
                        <Badge tone={portal.tone}>{portal.label}</Badge>
                      </TD>
                      {seesAll ? <TD className="text-sm">{c.owner?.name || <span className="text-muted-foreground">Sin asignar</span>}</TD> : null}
                      <TD className="text-right tabular-nums">{c._count.requests}</TD>
                      <TD className="whitespace-nowrap text-sm">
                        {c.lastActivityAt ? formatDateShort(c.lastActivityAt) : <span className="text-muted-foreground">Sin actividad</span>}
                      </TD>
                      <TD>
                        <ClientRowActions
                          canEdit={canEdit}
                          canDelete={canDelete}
                          client={{
                            id: c.id,
                            companyName: c.companyName,
                            tradeName: c.tradeName,
                            taxId: c.taxId,
                            segment: c.segment,
                            ownerId: c.ownerId,
                            website: c.website,
                            address: c.address,
                            city: c.city,
                            province: c.province,
                            country: c.country,
                            source: c.source,
                            notes: c.notes,
                            assignedPriceListId: c.assignedPriceListId,
                            tags: c.tags,
                            isActive: c.isActive,
                            historyCount: c._count.requests + c._count.quotes + c._count.accountMovements,
                          }}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-between text-sm">
        <span>
          {total} {total === 1 ? "cliente" : "clientes"} · página {page} de {pages}
        </span>
        <div className="flex gap-3">
          {page > 1 ? <Link href={{ query: { ...searchParams, page: page - 1 } }}>Anterior</Link> : null}
          {page < pages ? <Link href={{ query: { ...searchParams, page: page + 1 } }}>Siguiente</Link> : null}
        </div>
      </div>
    </div>
  );
}
