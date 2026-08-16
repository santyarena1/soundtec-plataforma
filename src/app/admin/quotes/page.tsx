import Link from "next/link";
import { Prisma, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatUsd } from "@/lib/utils";
import { QuoteRowActions } from "./quote-row-actions";
import { Settings } from "lucide-react";
import { requestShortId } from "@/lib/request-quote-link";

export const metadata = { title: "Admin · Cotizaciones" };

const statusLabel: Record<string, string> = {
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  READY: "Lista",
  ISSUED: "Emitida",
  SUPERSEDED: "Reemplazada",
  ARCHIVED: "Archivada",
};

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
  }>;
}) {
  const { user, permissions } = await requireQuotePermission("quotes.view_own");
  const seeAll = permissions.fullAccess || permissionsHave(permissions, "quotes.view_all");
  const canEdit = permissions.fullAccess || permissionsHave(permissions, "quotes.edit");
  const params = searchParams ? await searchParams : {};

  const q = (params.q || "").trim();
  const status = params.status && params.status in statusLabel ? (params.status as QuoteStatus) : undefined;
  const from = parseDateStart(params.from || "");
  const to = parseDateEnd(params.to || "");
  const sort: SortKey = params.sort && params.sort in SORTS ? (params.sort as SortKey) : "createdAt";
  const dir = params.dir === "asc" ? "asc" : "desc";

  const where: Prisma.QuoteWhereInput = {
    ...(seeAll ? {} : { ownerId: user.id }),
    ...(status ? { status } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { reference: { contains: q, mode: "insensitive" } },
            { contactName: { contains: q, mode: "insensitive" } },
            { client: { companyName: { contains: q, mode: "insensitive" } } },
            { owner: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const quotes = await prisma.quote.findMany({
    where,
    orderBy: { [SORTS[sort]]: dir },
    take: 300,
    include: {
      client: { select: { companyName: true } },
      owner: { select: { name: true } },
      items: { select: { lineTotalUsd: true } },
    },
  });

  const sortHref = (key: SortKey) => {
    const nextDir = sort === key && dir === "desc" ? "asc" : "desc";
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (params.from) sp.set("from", params.from);
    if (params.to) sp.set("to", params.to);
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
                <ButtonLink href="/admin/settings/quotes/plantilla" variant="outline" size="icon" aria-label="Editor de plantilla de cotizaciones">
                  <Settings className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink href="/admin/quotes/history" variant="outline">
                  Memoria histórica
                </ButtonLink>
              </>
            )}
            {permissionsHave(permissions, "quotes.create") || permissions.fullAccess ? (
              <ButtonLink href="/admin/quotes/new">Nueva cotización</ButtonLink>
            ) : null}
          </div>
        }
      />

      <form method="get" className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Label htmlFor="q">Buscar</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="Número, cliente, referencia…" />
        </div>
        <div>
          <Label htmlFor="status">Estado</Label>
          <Select id="status" name="status" defaultValue={status || ""}>
            <option value="">Todos</option>
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
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
        <Table>
          <THead>
            <TR>
              <TH>
                <Link href={sortHref("number")} className="hover:underline">
                  Número{sortMark("number")}
                </Link>
              </TH>
              <TH>Cliente</TH>
              <TH>Referencia</TH>
              <TH>
                <Link href={sortHref("status")} className="hover:underline">
                  Estado{sortMark("status")}
                </Link>
              </TH>
              <TH>Responsable</TH>
              <TH className="text-right">Total</TH>
              <TH>
                <Link href={sortHref("createdAt")} className="hover:underline">
                  Creada{sortMark("createdAt")}
                </Link>
              </TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {quotes.map((row) => {
              const total = row.items.reduce((s, i) => s + Number(i.lineTotalUsd), 0);
              return (
                <TR key={row.id}>
                  <TD>
                    <Link href={`/admin/quotes/${row.id}`} className="font-medium text-primary hover:underline">
                      {row.number}
                    </Link>
                    {row.sourceRequestId ? (
                      <p className="mt-0.5">
                        <Badge tone="accent">Importada #{requestShortId(row.sourceRequestId)}</Badge>
                      </p>
                    ) : null}
                  </TD>
                  <TD>{row.client?.companyName || "—"}</TD>
                  <TD className="max-w-[220px] truncate">{row.reference || "—"}</TD>
                  <TD>
                    <Badge tone={statusTone[row.status] || "muted"}>{statusLabel[row.status] || row.status}</Badge>
                  </TD>
                  <TD>{row.owner.name}</TD>
                  <TD className="text-right">{formatUsd(total)}</TD>
                  <TD>{formatDate(row.createdAt)}</TD>
                  <TD>
                    <div className="flex flex-col items-end gap-1">
                      <ButtonLink href={`/admin/quotes/${row.id}`} size="sm" variant="outline">
                        Editar
                      </ButtonLink>
                      <QuoteRowActions quoteId={row.id} status={row.status} canEdit={canEdit} />
                    </div>
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
