import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireQuotePermission } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatUsd } from "@/lib/utils";

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

export default async function AdminQuotesPage() {
  const { user, permissions } = await requireQuotePermission("quotes.view_own");
  const seeAll = permissions.fullAccess || permissionsHave(permissions, "quotes.view_all");

  const quotes = await prisma.quote.findMany({
    where: seeAll ? {} : { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      client: { select: { companyName: true } },
      owner: { select: { name: true } },
      items: { select: { lineTotalUsd: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cotizaciones"
        description="Propuestas técnico-comerciales. La IA sugiere; vos emitís."
        actions={
          permissionsHave(permissions, "quotes.create") || permissions.fullAccess ? (
            <ButtonLink href="/admin/quotes/new">Nueva cotización</ButtonLink>
          ) : null
        }
      />

      {quotes.length === 0 ? (
        <TableEmpty message="Todavía no hay cotizaciones." />
      ) : (
      <Table>
        <THead>
          <TR>
            <TH>Número</TH>
            <TH>Cliente</TH>
            <TH>Referencia</TH>
            <TH>Estado</TH>
            <TH>Responsable</TH>
            <TH className="text-right">Ítems</TH>
            <TH>Fecha</TH>
          </TR>
        </THead>
        <TBody>
            {quotes.map((q) => {
              const total = q.items.reduce((s, i) => s + Number(i.lineTotalUsd), 0);
              return (
                <TR key={q.id}>
                  <TD>
                    <Link href={`/admin/quotes/${q.id}`} className="font-medium text-primary hover:underline">
                      {q.number}
                    </Link>
                  </TD>
                  <TD>{q.client?.companyName || "—"}</TD>
                  <TD className="max-w-[220px] truncate">{q.reference || "—"}</TD>
                  <TD>
                    <Badge tone={statusTone[q.status] || "muted"}>{statusLabel[q.status] || q.status}</Badge>
                  </TD>
                  <TD>{q.owner.name}</TD>
                  <TD className="text-right">{formatUsd(total)}</TD>
                  <TD>{formatDate(q.createdAt)}</TD>
                </TR>
              );
            })}
        </TBody>
      </Table>
      )}
    </div>
  );
}
