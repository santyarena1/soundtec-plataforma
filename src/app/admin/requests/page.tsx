import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import {
  REQUEST_STATUS_META,
  formatRelative,
  statusLabel,
  statusTone,
  typeLabel,
  type RequestStatus,
} from "@/lib/request-status";
import { Inbox, MessageSquare, ArrowRight } from "lucide-react";

export const metadata = { title: "Admin · Solicitudes" };

const FILTERABLE: RequestStatus[] = ["SENT", "IN_REVIEW", "ANSWERED", "CONFIRMED", "REJECTED", "CLOSED", "DRAFT"];

function parseDateStart(value: string) {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDateEnd(value: string) {
  if (!value) return undefined;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; q?: string; type?: string; from?: string; to?: string; sort?: string }>;
}) {
  await requireAdmin();
  const params = searchParams ? await searchParams : {};

  const status = params.status && FILTERABLE.includes(params.status as RequestStatus) ? (params.status as RequestStatus) : null;
  const q = (params.q || "").trim();
  const type = params.type === "QUOTE" || params.type === "ORDER" || params.type === "CONSULTATION" ? params.type : null;
  const from = parseDateStart(params.from || "");
  const to = parseDateEnd(params.to || "");
  const sort = params.sort === "oldest" ? "oldest" : "recent";

  const where: Prisma.CustomerRequestWhereInput = {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(from || to ? { updatedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { projectDescription: { contains: q, mode: "insensitive" } },
            { user: { name: { contains: q, mode: "insensitive" } } },
            { user: { email: { contains: q, mode: "insensitive" } } },
            { user: { companyName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [requests, grouped] = await Promise.all([
    prisma.customerRequest.findMany({
      where,
      orderBy: { updatedAt: sort === "oldest" ? "asc" : "desc" },
      take: 100,
      include: {
        user: { select: { name: true, companyName: true, email: true } },
        items: { select: { quantity: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, sender: { select: { name: true, role: true } } },
        },
        _count: { select: { items: true, messages: true } },
      },
    }),
    prisma.customerRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countByStatus = new Map(grouped.map((g) => [g.status as RequestStatus, g._count._all]));
  const totalCount = grouped.reduce((acc, g) => acc + g._count._all, 0);

  const buildHref = (next: Partial<Record<string, string | null>>) => {
    const sp = new URLSearchParams();
    const merged: Record<string, string | null> = {
      status: status ?? null,
      q: q || null,
      type: type ?? null,
      from: params.from || null,
      to: params.to || null,
      sort: sort === "oldest" ? "oldest" : null,
      ...next,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) sp.set(key, value);
    }
    const qs = sp.toString();
    return qs ? `/admin/requests?${qs}` : "/admin/requests";
  };

  const hasFilters = Boolean(status || q || type || from || to);

  const highlights = [
    {
      key: "SENT" as RequestStatus,
      title: "Nuevas sin tomar",
      hint: "Nadie las miró todavía",
      count: countByStatus.get("SENT") ?? 0,
      accent: "border-warning/40 bg-warning/5",
    },
    {
      key: "IN_REVIEW" as RequestStatus,
      title: "En revisión",
      hint: "Las estamos trabajando",
      count: countByStatus.get("IN_REVIEW") ?? 0,
      accent: "border-accent/40 bg-accent/5",
    },
    {
      key: "ANSWERED" as RequestStatus,
      title: "Esperando al cliente",
      hint: "Ya respondimos",
      count: countByStatus.get("ANSWERED") ?? 0,
      accent: "border-primary/30 bg-primary/5",
    },
    {
      key: "CONFIRMED" as RequestStatus,
      title: "Confirmadas",
      hint: "Cerradas con acuerdo",
      count: countByStatus.get("CONFIRMED") ?? 0,
      accent: "border-success/30 bg-success/5",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Solicitudes"
        description="Todo lo que los clientes te mandan desde el portal: cotizaciones, pedidos y consultas."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {highlights.map((h) => {
          const active = status === h.key;
          return (
            <Link key={h.key} href={buildHref({ status: active ? null : h.key })} className="group">
              <Card
                className={`h-full transition-shadow group-hover:shadow-md ${h.accent} ${
                  active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                }`}
              >
                <CardContent className="flex items-center justify-between p-4 pt-4">
                  <div>
                    <p className="text-sm font-medium">{h.title}</p>
                    <p className="text-xs text-muted-foreground">{h.hint}</p>
                  </div>
                  <span className="text-2xl font-semibold tabular-nums">{h.count}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <form method="get" className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <div className="lg:col-span-2">
          <Label htmlFor="q">Buscar</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="Cliente, empresa, email o texto del proyecto…" />
        </div>
        <div>
          <Label htmlFor="type">Tipo</Label>
          <Select id="type" name="type" defaultValue={type || ""}>
            <option value="">Todos</option>
            <option value="QUOTE">Cotización</option>
            <option value="ORDER">Pedido</option>
            <option value="CONSULTATION">Consulta</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="from">Desde</Label>
          <Input id="from" name="from" type="date" defaultValue={params.from || ""} />
        </div>
        <div>
          <Label htmlFor="to">Hasta</Label>
          <Input id="to" name="to" type="date" defaultValue={params.to || ""} />
        </div>
        <div className="flex items-end gap-2">
          <input type="hidden" name="sort" value={sort} />
          <Button type="submit" size="sm">
            Filtrar
          </Button>
          <ButtonLink href="/admin/requests" size="sm" variant="outline">
            Limpiar
          </ButtonLink>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildHref({ status: null })}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            !status ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-secondary"
          }`}
        >
          Todas <span className="tabular-nums opacity-70">{totalCount}</span>
        </Link>
        {FILTERABLE.map((s) => {
          const count = countByStatus.get(s) ?? 0;
          return (
            <Link
              key={s}
              href={buildHref({ status: status === s ? null : s })}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                status === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {statusLabel(s)} <span className="tabular-nums opacity-70">{count}</span>
            </Link>
          );
        })}
        <Link
          href={buildHref({ sort: sort === "oldest" ? null : "oldest" })}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {sort === "oldest" ? "Ordenando: más antiguas primero" : "Ordenando: más recientes primero"}
        </Link>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title={hasFilters ? "Ninguna solicitud con esos filtros" : "Todavía no hay solicitudes"}
          description={
            hasFilters
              ? "Probá ampliar el rango de fechas o limpiar la búsqueda."
              : "Cuando un cliente envíe una solicitud desde el portal, va a aparecer acá."
          }
          action={hasFilters ? <ButtonLink href="/admin/requests" variant="outline" size="sm">Limpiar filtros</ButtonLink> : null}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Solicitud</TH>
              <TH>Cliente</TH>
              <TH>Contenido</TH>
              <TH>Última actividad</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acción</TH>
            </TR>
          </THead>
          <TBody>
            {requests.map((r) => {
              const units = r.items.reduce((acc, i) => acc + i.quantity, 0);
              const last = r.messages[0];
              const clientWroteLast = last?.sender.role === "CLIENT";
              const needsAction =
                r.status === "SENT" || (clientWroteLast && (r.status === "IN_REVIEW" || r.status === "ANSWERED"));
              const StatusIcon = REQUEST_STATUS_META[r.status as RequestStatus]?.icon;

              return (
                <TR key={r.id} className={needsAction ? "bg-warning/5" : ""}>
                  <TD>
                    <div className="flex items-center gap-2">
                      {needsAction ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-label="Requiere acción" />
                      ) : (
                        <span className="h-2 w-2 shrink-0" />
                      )}
                      <div>
                        <Link href={`/admin/requests/${r.id}`} className="font-medium text-primary hover:underline">
                          #{r.id.slice(-6).toUpperCase()}
                        </Link>
                        <p className="text-xs text-muted-foreground">{typeLabel(r.type)}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <p className="font-medium">{r.user.companyName || r.user.name}</p>
                    <p className="text-xs text-muted-foreground">{r.user.email}</p>
                  </TD>
                  <TD>
                    <p className="text-sm">
                      {r._count.items} {r._count.items === 1 ? "producto" : "productos"}
                      <span className="text-muted-foreground"> · {units} u.</span>
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      {r._count.messages} {r._count.messages === 1 ? "mensaje" : "mensajes"}
                    </p>
                  </TD>
                  <TD>
                    <p className="text-sm">{formatRelative(r.updatedAt)}</p>
                    <p className="text-xs text-muted-foreground">
                      {last ? (clientWroteLast ? `Escribió ${last.sender.name}` : "Respondimos nosotros") : formatDate(r.createdAt)}
                    </p>
                  </TD>
                  <TD>
                    <Badge tone={statusTone(r.status)}>
                      {StatusIcon ? <StatusIcon className="h-3 w-3" /> : null}
                      {statusLabel(r.status)}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <ButtonLink href={`/admin/requests/${r.id}`} size="sm" variant={needsAction ? "primary" : "outline"}>
                      {needsAction ? "Responder" : "Abrir"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </ButtonLink>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
