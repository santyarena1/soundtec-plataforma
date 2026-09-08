import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getActiveDraftSummary } from "@/lib/draft-request";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatUsd } from "@/lib/utils";
import { createRequestDraft } from "@/server/actions/requests";
import { ShoppingBag } from "lucide-react";

export const metadata = { title: "Pedidos" };

const statusMap: Record<string, { tone: "muted" | "primary" | "accent" | "success" | "warning" | "destructive"; label: string }> = {
  DRAFT: { tone: "muted", label: "En armado" },
  SENT: { tone: "accent", label: "Enviado" },
  IN_REVIEW: { tone: "warning", label: "En revisión" },
  ANSWERED: { tone: "primary", label: "Respondido" },
  CONFIRMED: { tone: "success", label: "Confirmado" },
  REJECTED: { tone: "destructive", label: "Rechazado" },
  CLOSED: { tone: "muted", label: "Cerrado" },
};

const typeMap: Record<string, string> = {
  QUOTE: "Cotización",
  ORDER: "Pedido",
  CONSULTATION: "Consulta",
};

export default async function RequestsPage() {
  const user = await requireUser();
  const [requests, activeDraft] = await Promise.all([
    prisma.customerRequest.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { items: true, messages: true } } },
    }),
    getActiveDraftSummary(user.id),
  ]);

  const sentRequests = requests.filter((r) => r.status !== "DRAFT");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis pedidos"
        description="Armá tu pedido o cotización en un solo lugar. Desde el catálogo, «Agregar a mi pedido» suma productos al borrador activo."
        actions={
          <form action={createRequestDraft}>
            <input type="hidden" name="forceNew" value="true" />
            <input type="hidden" name="type" value="QUOTE" />
            <Button type="submit" variant="outline">
              Nuevo pedido vacío
            </Button>
          </form>
        }
      />

      {activeDraft ? (
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <ShoppingBag className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">Tu pedido en armado</p>
                <p className="text-sm text-muted-foreground">
                  {activeDraft.itemCount} producto(s) · {activeDraft.unitCount} unidad(es) ·{" "}
                  <span className="text-success font-medium tabular-nums">
                    {formatUsd(activeDraft.subtotalUsd)}
                  </span>{" "}
                  estimado · actualizada {formatDate(activeDraft.updatedAt)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/portal/products">Seguir agregando</ButtonLink>
              <ButtonLink href={`/portal/requests/${activeDraft.id}`} variant="outline">
                Abrir y enviar
              </ButtonLink>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {sentRequests.length === 0 ? (
        <TableEmpty message="Todavía no enviaste pedidos a Soundtec. Armá la primera desde el catálogo." />
      ) : (
        <>
          <h2 className="text-sm font-semibold text-muted-foreground">Historial enviado</h2>
          <Table>
            <THead>
              <TR>
                <TH>ID</TH>
                <TH>Tipo</TH>
                <TH>Ítems</TH>
                <TH>Mensajes</TH>
                <TH>Estado</TH>
                <TH>Última actualización</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {sentRequests.map((r) => {
                const s = statusMap[r.status] || statusMap.DRAFT;
                return (
                  <TR key={r.id}>
                    <TD>#{r.id.slice(-6).toUpperCase()}</TD>
                    <TD>{typeMap[r.type] || r.type}</TD>
                    <TD>{r._count.items}</TD>
                    <TD>{r._count.messages}</TD>
                    <TD>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </TD>
                    <TD>{formatDate(r.updatedAt)}</TD>
                    <TD className="text-right">
                      <ButtonLink href={`/portal/requests/${r.id}`} size="sm" variant="outline">
                        Abrir
                      </ButtonLink>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </>
      )}
    </div>
  );
}
