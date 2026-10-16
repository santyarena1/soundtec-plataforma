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
import { formatDate } from "@/lib/utils";
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
    ...(cutoff ? { OR: [{ lastActivityAt: { lt: cutoff } }, { lastActivityAt: null }] } : {}),
  };
  const openStatuses = ["DRAFT", "SENT", "IN_REVIEW"] as const;
  const [clients, total, owners, segments, totalActive, withPortal, withOpen, old] =
    await Promise.all([
      prisma.client.findMany({
        where,
        skip: (page - 1) * size,
        take: size,
        orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
        include: {
          owner: { select: { name: true } },
          contacts: { where: { isPrimary: true }, take: 1 },
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
      prisma.client.count({ where: { ...scope, portalUsers: { some: {} } } }),
      prisma.client.count({ where: { ...scope, requests: { some: { status: { in: [...openStatuses] } } } } }),
      prisma.client.count({
        where: {
          ...scope,
          OR: [
            { lastActivityAt: { lt: new Date(Date.now() - 90 * 86400000) } },
            { lastActivityAt: null },
          ],
        },
      }),
    ]);
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Empresas, contactos y seguimiento comercial en un solo lugar."
        actions={
          canCreate ? (
            <ButtonLink href="/admin/clients/nuevo" data-tour="clients-new-btn">
              Nuevo cliente
            </ButtonLink>
          ) : null
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [totalActive, "Clientes activos"],
          [withPortal, "Con usuarios del portal"],
          [withOpen, "Con pedidos abiertos"],
          [old, "Sin actividad hace 90 días"],
        ].map(([n, l]) => (
          <Card key={String(l)}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold">{n}</p>
              <p className="text-xs text-muted-foreground">{l}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <form className="grid gap-2 md:grid-cols-6">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Empresa, CUIT, contacto o email"
              className="md:col-span-2"
            />
            <Select name="status" defaultValue={searchParams.status || ""}>
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </Select>
            <Select name="segment" defaultValue={searchParams.segment || ""}>
              <option value="">Todos los segmentos</option>
              {segments.map((x) => x.segment && <option key={x.segment}>{x.segment}</option>)}
            </Select>
            {seesAll ? (
              <Select name="owner" defaultValue={searchParams.owner || ""}>
                <option value="">Todos los responsables</option>
                {owners.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select name="portal" defaultValue={searchParams.portal || ""}>
              <option value="">Con o sin acceso</option>
              <option value="none">Sin usuarios del portal</option>
            </Select>
            <Select name="inactive" defaultValue={searchParams.inactive || ""}>
              <option value="">Cualquier actividad</option>
              <option value="30">Sin actividad +30 días</option>
              <option value="90">Sin actividad +90 días</option>
            </Select>
            <Select name="size" defaultValue={String(size)}>
              <option value="25">25 por página</option>
              <option value="50">50 por página</option>
            </Select>
            <button className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">
              Aplicar filtros
            </button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          {!clients.length ? (
            <TableEmpty message="No encontramos clientes con esos filtros." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Empresa</TH>
                  <TH>Contacto principal</TH>
                  <TH>Segmento</TH>
                  <TH>Responsable</TH>
                  <TH>Usuarios</TH>
                  <TH>Pedidos</TH>
                  <TH>Última actividad</TH>
                  <TH>Estado</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {clients.map((c) => {
                  const contact = c.contacts[0];
                  return (
                    <TR key={c.id}>
                      <TD>
                        <Link
                          className="font-medium hover:underline"
                          href={`/admin/clients/${c.id}`}
                        >
                          {c.companyName}
                        </Link>
                        {c.tradeName ? (
                          <p className="text-xs text-muted-foreground">{c.tradeName}</p>
                        ) : null}
                      </TD>
                      <TD>
                        {contact?.name || c.contactName || "—"}
                        <p className="text-xs text-muted-foreground">{contact?.email || c.email}</p>
                      </TD>
                      <TD>{c.segment ? <Badge>{c.segment}</Badge> : "—"}</TD>
                      <TD>{c.owner?.name || "Sin asignar"}</TD>
                      <TD>{c._count.portalUsers}</TD>
                      <TD>{c._count.requests}</TD>
                      <TD>{c.lastActivityAt ? formatDate(c.lastActivityAt) : "Sin actividad"}</TD>
                      <TD>
                        <Badge tone={c.isActive ? "success" : "muted"}>
                          {c.isActive ? "Activo" : "Inactivo"}
                        </Badge>
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
          Página {page} de {pages}
        </span>
        <div className="flex gap-3">
          {page > 1 ? (
            <Link href={{ query: { ...searchParams, page: page - 1 } }}>Anterior</Link>
          ) : null}
          {page < pages ? (
            <Link href={{ query: { ...searchParams, page: page + 1 } }}>Siguiente</Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
