import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Admin · Solicitudes" };

const statusTone: Record<string, "muted" | "primary" | "accent" | "success" | "warning" | "destructive"> = {
  DRAFT: "muted",
  SENT: "accent",
  IN_REVIEW: "warning",
  ANSWERED: "primary",
  CONFIRMED: "success",
  REJECTED: "destructive",
  CLOSED: "muted",
};

const STATUSES = ["SENT", "IN_REVIEW", "ANSWERED", "CONFIRMED", "REJECTED", "CLOSED"] as const;
type StatusFilter = (typeof STATUSES)[number] | "ALL";
const statusLabel: Record<string, string> = {
  SENT: "Enviada",
  IN_REVIEW: "En revisión",
  ANSWERED: "Respondida",
  CONFIRMED: "Confirmada",
  REJECTED: "Rechazada",
  CLOSED: "Cerrada",
  DRAFT: "Borrador",
};
const typeLabel: Record<string, string> = {
  QUOTE: "Cotización",
  ORDER: "Pedido",
  CONSULTATION: "Consulta",
};

export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const validStatuses = new Set<string>(STATUSES);
  const status: StatusFilter = params.status && validStatuses.has(params.status) ? (params.status as StatusFilter) : "ALL";

  const requests = await prisma.customerRequest.findMany({
    where: status === "ALL" ? {} : { status: status as (typeof STATUSES)[number] },
    orderBy: { updatedAt: "desc" },
    take: 80,
    include: {
      user: { select: { name: true, companyName: true, email: true } },
      _count: { select: { items: true, messages: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Solicitudes" description="Cotizaciones, consultas y pedidos enviados por clientes." />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/requests"
          className={`rounded-full border px-3 py-1 text-xs ${
            status === "ALL" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-secondary"
          }`}
        >
          Todas
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/requests?status=${s}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              status === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {statusLabel[s] || s}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <TableEmpty />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>ID</TH>
              <TH>Cliente</TH>
              <TH>Tipo</TH>
              <TH>Ítems</TH>
              <TH>Mensajes</TH>
              <TH>Estado</TH>
              <TH>Actualizada</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {requests.map((r) => (
              <TR key={r.id}>
                <TD>#{r.id.slice(-6).toUpperCase()}</TD>
                <TD>
                  <p className="font-medium">{r.user.companyName || r.user.name}</p>
                  <p className="text-xs text-muted-foreground">{r.user.email}</p>
                </TD>
                <TD>{typeLabel[r.type] || r.type}</TD>
                <TD>{r._count.items}</TD>
                <TD>{r._count.messages}</TD>
                <TD><Badge tone={statusTone[r.status] || "muted"}>{statusLabel[r.status] || r.status}</Badge></TD>
                <TD>{formatDate(r.updatedAt)}</TD>
                <TD className="text-right">
                  <Link href={`/admin/requests/${r.id}`} className="text-sm text-accent hover:underline">
                    Abrir
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
