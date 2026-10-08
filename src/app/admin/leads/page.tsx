import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Download, Eye, Mail, Phone, QrCode, ScanLine, UserPlus } from "lucide-react";
import { requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Leads del catálogo" };

type Search = { q?: string; event?: string; source?: string; page?: string };

const PAGE_SIZE = 30;

const REQUEST_LABEL = { PENDING: "Pidió cuenta", APPROVED: "Cuenta aprobada", REJECTED: "Cuenta rechazada" } as const;
const REQUEST_TONE = { PENDING: "warning", APPROVED: "success", REJECTED: "muted" } as const;

/**
 * Personas que dejaron sus datos en la bienvenida del catálogo (por QR de
 * un evento o entrando por la web). Pantalla comercial: a quién contactar,
 * de dónde vino, qué miró y si ya pidió cuenta.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("clients.view");
  const params = await searchParams;
  const q = params.q?.trim();
  const eventId = params.event || undefined;
  const source = params.source === "QR" || params.source === "WEB" ? params.source : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.VisitorLeadWhereInput = {
    ...(eventId ? { eventId } : {}),
    ...(source ? { source } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { interest: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [leads, total, events, fromQr, withPhone, withInterest] = await Promise.all([
    prisma.visitorLead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { event: { select: { name: true } }, qr: { select: { label: true } } },
    }),
    prisma.visitorLead.count({ where }),
    prisma.expoEvent.findMany({ orderBy: { startsAt: "desc" }, select: { id: true, name: true } }),
    prisma.visitorLead.count({ where: { ...where, source: "QR" } }),
    prisma.visitorLead.count({ where: { ...where, phone: { not: null } } }),
    prisma.visitorLead.count({ where: { ...where, interest: { not: null } } }),
  ]);

  // Si después pidieron cuenta (por el lead o por el mismo mail), se muestra el estado.
  const requests = leads.length
    ? await prisma.accountRequest.findMany({
        where: {
          OR: [
            { leadId: { in: leads.map((l) => l.id) } },
            { email: { in: leads.map((l) => l.email), mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          leadId: true,
          email: true,
          status: true,
          company: true,
          activity: true,
          activityOther: true,
          location: true,
          fullName: true,
        },
      })
    : [];
  const requestFor = (lead: { id: string; email: string }) =>
    requests.find((r) => r.leadId === lead.id) ??
    requests.find((r) => r.email.toLowerCase() === lead.email.toLowerCase());

  const visitorIds = [...new Set(leads.map((l) => l.visitorId))];
  const visitGroups = visitorIds.length
    ? await prisma.expoVisit.groupBy({
        by: ["visitorId", "type"],
        where: { visitorId: { in: visitorIds } },
        _count: { _all: true },
      })
    : [];
  const visitCount = (visitorId: string, type: string) =>
    visitGroups.find((g) => g.visitorId === visitorId && g.type === type)?._count._all ?? 0;

  const brandViewRows = visitorIds.length
    ? await prisma.expoVisit.findMany({
        where: { visitorId: { in: visitorIds }, type: "BRAND_VIEW", brandId: { not: null } },
        select: { visitorId: true, brandId: true },
        distinct: ["visitorId", "brandId"],
      })
    : [];
  const brandIds = [...new Set(brandViewRows.map((r) => r.brandId!).filter(Boolean))];
  const brands = brandIds.length
    ? await prisma.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } })
    : [];
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const brandsFor = (visitorId: string) =>
    brandViewRows
      .filter((r) => r.visitorId === visitorId && r.brandId)
      .map((r) => brandName.get(r.brandId!) ?? r.brandId!)
      .filter(Boolean)
      .slice(0, 8);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterParams = () => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (eventId) next.set("event", eventId);
    if (source) next.set("source", source);
    return next;
  };
  const pageHref = (target: number) => {
    const next = filterParams();
    next.set("page", String(target));
    return `/admin/leads?${next.toString()}`;
  };
  const exportQs = filterParams().toString();
  const exportHref = exportQs ? `/api/admin/leads/export?${exportQs}` : "/api/admin/leads/export";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads del catálogo"
        description="Quienes dejaron sus datos al entrar al catálogo, por el QR de un evento o por la web. Del más reciente al más viejo."
        actions={
          <a
            href={exportHref}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary"
          >
            <Download className="h-4 w-4" />
            Descargar Excel{total > 0 ? ` (${total.toLocaleString("es-AR")})` : ""}
          </a>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [total, "Resultados"],
          [fromQr, "Llegaron por QR"],
          [withPhone, "Dejaron teléfono"],
          [withInterest, "Contaron su interés"],
        ].map(([value, label]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold">{Number(value).toLocaleString("es-AR")}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-center gap-2">
            <Input name="q" defaultValue={q} placeholder="Mail, nombre, empresa, teléfono o interés" className="min-w-[16rem] flex-1" />
            <Select name="event" defaultValue={eventId ?? ""} className="w-auto">
              <option value="">Todos los eventos</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
            <Select name="source" defaultValue={source ?? ""} className="w-auto">
              <option value="">QR y web</option>
              <option value="QR">Solo QR</option>
              <option value="WEB">Solo web</option>
            </Select>
            <button className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">Buscar</button>
          </form>
        </CardContent>
      </Card>

      {leads.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={<UserPlus className="h-6 w-6" />}
              title="No hay leads con estos filtros"
              description="Cuando alguien deje su mail en la bienvenida del catálogo va a aparecer acá."
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => {
            const request = requestFor(lead);
            const title = lead.name || lead.company || lead.email;
            const scans = visitCount(lead.visitorId, "SCAN");
            const brandViews = visitCount(lead.visitorId, "BRAND_VIEW");
            const viewedBrands = brandsFor(lead.visitorId);
            const activityLabel =
              request?.activity === "Otra" ? request.activityOther : request?.activity;

            return (
              <li key={lead.id}>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-base font-semibold">{title}</p>
                        {lead.name && lead.company && lead.company !== title ? (
                          <p className="text-sm text-muted-foreground">{lead.company}</p>
                        ) : null}
                        {!lead.name && lead.company === title ? (
                          <p className="text-xs text-muted-foreground">Sin nombre de contacto</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {request ? (
                          <Badge tone={REQUEST_TONE[request.status]}>{REQUEST_LABEL[request.status]}</Badge>
                        ) : null}
                        {lead.source === "QR" ? (
                          <Badge tone="accent">
                            <QrCode className="mr-1 inline h-3 w-3" />
                            {lead.event?.name ?? "QR"}
                            {lead.qr?.label ? ` · ${lead.qr.label}` : ""}
                          </Badge>
                        ) : (
                          <Badge tone="primary">Web</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{formatDate(lead.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                      <a className="inline-flex items-center gap-1.5 text-primary hover:underline" href={`mailto:${lead.email}`}>
                        <Mail className="h-3.5 w-3.5" />
                        {lead.email}
                      </a>
                      {lead.phone ? (
                        <a className="inline-flex items-center gap-1.5 text-primary hover:underline" href={`tel:${lead.phone}`}>
                          <Phone className="h-3.5 w-3.5" />
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          Sin teléfono
                        </span>
                      )}
                    </div>

                    {lead.interest ? (
                      <p className="border-l-2 border-border pl-3 text-sm text-muted-foreground">“{lead.interest}”</p>
                    ) : null}

                    {request ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        {request.fullName && request.fullName !== lead.name ? (
                          <span>Pedido a nombre de {request.fullName}</span>
                        ) : null}
                        {activityLabel ? <Badge tone="muted">{activityLabel}</Badge> : null}
                        {request.location ? <span>{request.location}</span> : null}
                        <Link href="/admin/account-requests" className="text-primary hover:underline">
                          Ver solicitud
                        </Link>
                      </div>
                    ) : null}

                    {viewedBrands.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Miró:</span>
                        {viewedBrands.map((name) => (
                          <span key={name} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <ScanLine className="h-3.5 w-3.5" />
                        {scans} {scans === 1 ? "escaneo" : "escaneos"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {brandViews} {brandViews === 1 ? "marca vista" : "marcas vistas"}
                      </span>
                      {lead.source === "QR" && lead.qr?.label ? (
                        <span className="inline-flex items-center gap-1">
                          <QrCode className="h-3.5 w-3.5" />
                          QR {lead.qr.label}
                        </span>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page} de {pages} · {total.toLocaleString("es-AR")} leads
          </span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">Anterior</Link> : null}
            {page < pages ? <Link href={pageHref(page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">Siguiente</Link> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
