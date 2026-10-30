import { payableLines } from "@/lib/quote-totals";
import { primaryAlternativeItems } from "@/lib/quote-alternatives";
import { QUOTE_STATUS_LABEL, cleanQuoteReference, quoteStatusLabel } from "@/lib/quote-status";
import Link from "next/link";
import { Prisma, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateShort, formatUsd } from "@/lib/utils";
import { QuotesTable } from "./quotes-table";
import { Settings } from "lucide-react";
import { requestShortId } from "@/lib/request-quote-link";

export const metadata = { title: "Admin · Cotizaciones" };


const statusTone: Record<string, "muted" | "primary" | "accent" | "success" | "warning" | "destructive"> = {
  DRAFT: "muted",
  IN_REVIEW: "warning",
  READY: "accent",
  ISSUED: "success",
  SUPERSEDED: "muted",
  ARCHIVED: "muted",
};

const SORTS = {
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  number: "number",
  issuedAt: "issuedAt",
  status: "status",
} as const;

type SortKey = keyof typeof SORTS;

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

const PAGE_SIZE = 50;

export default async function AdminQuotesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    sort?: string;
    dir?: string;
    owner?: string;
    page?: string;
  }>;
}) {
  const { user, permissions } = await requireQuotePermission("quotes.view_own");
  const seeAll = permissions.fullAccess || permissionsHave(permissions, "quotes.view_all");
  const canEdit = permissions.fullAccess || permissionsHave(permissions, "quotes.edit");
  const params = searchParams ? await searchParams : {};

  const q = (params.q || "").trim();
  const status = params.status && params.status in QUOTE_STATUS_LABEL ? (params.status as QuoteStatus) : undefined;
  const from = parseDateStart(params.from || "");
  const to = parseDateEnd(params.to || "");
  const sort: SortKey = params.sort && params.sort in SORTS ? (params.sort as SortKey) : "createdAt";
  const dir = params.dir === "asc" ? "asc" : "desc";

  const ownerFilter = seeAll && params.owner ? params.owner : null;
  const page = Math.max(1, Number(params.page) || 1);
  const where: Prisma.QuoteWhereInput = {
    ...(seeAll ? (ownerFilter ? { ownerId: ownerFilter } : {}) : { ownerId: user.id }),
    ...(status ? { status } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { reference: { contains: q, mode: "insensitive" } },
            { contactName: { contains: q, mode: "insensitive" } },
            { client: { companyName: { contains: q, mode: "insensitive" } } },
            { clientName: { contains: q, mode: "insensitive" } },
            { owner: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [quotes, total, owners] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: { [SORTS[sort]]: dir },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        client: { select: { companyName: true } },
        owner: { select: { name: true } },
        // El total suma lo que va al precio (sin filas «dejar afuera»); con varias alternativas, la por defecto.
        items: { select: { lineTotalUsd: true, excluded: true, optional: true, ivaRate: true, alternativeId: true } },
        alternatives: { select: { id: true, name: true, isDefault: true, sortOrder: true } },
        terms: { select: { validityDays: true } },
      },
    }),
    prisma.quote.count({ where }),
    seeAll
      ? prisma.user.findMany({ where: { ownedQuotes: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string | null }>),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value && key !== "page") sp.set(key, String(value));
    if (target > 1) sp.set("page", String(target));
    return `/admin/quotes?${sp.toString()}`;
  };

  const sortHref = (key: SortKey) => {
    const nextDir = sort === key && dir === "desc" ? "asc" : "desc";
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (params.from) sp.set("from", params.from);
    if (params.to) sp.set("to", params.to);
    if (ownerFilter) sp.set("owner", ownerFilter);
    sp.set("sort", key);
    sp.set("dir", nextDir);
    return `/admin/quotes?${sp.toString()}`;
  };

  const sortMark = (key: SortKey) => (sort === key ? (dir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cotizaciones"
        description="Buscá, filtrá, editá, cambiá el estado o eliminá."
        actions={
          <div className="flex flex-wrap gap-2">
            {(permissions.fullAccess || permissionsHave(permissions, "quotes.manage_library")) && (
              <>
                <ButtonLink href="/admin/settings/quotes" variant="outline" size="icon" aria-label="Configuración de cotizaciones">
                  <Settings className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink href="/admin/quotes/history" variant="outline" data-tour="quotes-history">
                  Memoria histórica
                </ButtonLink>
              </>
            )}
            {permissionsHave(permissions, "quotes.create") || permissions.fullAccess ? (
              <div className="flex gap-2">
              <ButtonLink href="/admin/quotes/quick" variant="outline" data-tour="quotes-quick-btn">Cotización rápida</ButtonLink>
              <ButtonLink href="/admin/quotes/new" data-tour="quotes-new-btn">
                Nueva cotización
              </ButtonLink>
              </div>
            ) : null}
          </div>
        }
      />

      <form method="get" className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-7">
        <div className="lg:col-span-2">
          <Label htmlFor="q">Buscar</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="Número, cliente, referencia…" />
        </div>
        <div>
          <Label htmlFor="status">Estado</Label>
          <Select id="status" name="status" defaultValue={status || ""}>
            <option value="">Todos</option>
            {Object.entries(QUOTE_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        {seeAll ? (
          <div>
            <Label htmlFor="owner">Responsable</Label>
            <Select id="owner" name="owner" defaultValue={ownerFilter || ""}>
              <option value="">Todos</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name || "Sin nombre"}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
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
          <input type="hidden" name="dir" value={dir} />
          <Button type="submit" size="sm">
            Filtrar
          </Button>
          <ButtonLink href="/admin/quotes" size="sm" variant="outline">
            Limpiar
          </ButtonLink>
        </div>
      </form>

      {quotes.length === 0 ? (
        <TableEmpty message={q || status || from || to ? "Ninguna cotización con esos filtros." : "Todavía no hay cotizaciones."} />
      ) : (
        <QuotesTable
          canEdit={canEdit}
          rows={quotes.map((row) => {
            const net = payableLines(primaryAlternativeItems(row.items, row.alternatives)).reduce((sum, item) => sum + Number(item.lineTotalUsd), 0);
            const expires = row.status === "ISSUED" && row.issuedAt ? new Date(row.issuedAt.getTime() + (row.terms?.validityDays ?? 5) * 86_400_000) : null;
            const expired = expires ? expires.getTime() < Date.now() : false;
            return {
              id: row.id,
              number: row.number,
              requestTag: row.sourceRequestId ? requestShortId(row.sourceRequestId) : null,
              client: row.client?.companyName || row.clientName || "Sin cliente",
              owner: row.owner.name || "",
              reference: cleanQuoteReference(row.reference),
              status: row.status,
              statusLabel: quoteStatusLabel(row.status, row.pdfOutdated),
              statusTone: statusTone[row.status] || "muted",
              net,
              created: formatDateShort(row.createdAt),
              expires: expires ? { label: `${expired ? "Vencida" : "Vence"} ${formatDateShort(expires)}`, expired } : null,
              issued: row.status === "ISSUED" && !!row.pdfBlobUrl,
              isQuick: row.isQuick,
            };
          })}
        />
      )}
      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
              Anterior
            </Link>
          ) : null}
          <span className="text-muted-foreground">
            Página {page} de {totalPages} · {total} cotizaciones
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
              Siguiente
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
