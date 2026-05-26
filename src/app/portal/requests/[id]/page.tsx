import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { calculatePricesForProducts } from "@/lib/pricing";
import { resolveCommercialClientId } from "@/lib/client-context";
import { getGlobalMarginPercent } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDate, formatUsd } from "@/lib/utils";
import { postRequestMessage } from "@/server/actions/requests";
import { DraftRequestEditor } from "./draft-request-editor";
import { ArrowLeft, MessageSquare, Sparkles, Package } from "lucide-react";

const statusMap: Record<string, { tone: "muted" | "primary" | "accent" | "success" | "warning" | "destructive"; label: string }> = {
  DRAFT: { tone: "muted", label: "Borrador" },
  SENT: { tone: "accent", label: "Enviada" },
  IN_REVIEW: { tone: "warning", label: "En revisión" },
  ANSWERED: { tone: "primary", label: "Respondida" },
  CONFIRMED: { tone: "success", label: "Confirmada" },
  REJECTED: { tone: "destructive", label: "Rechazada" },
  CLOSED: { tone: "muted", label: "Cerrada" },
};

function RequestItemsTable({
  items,
  prices,
  title,
  highlight,
}: {
  items: Array<{
    id: string;
    quantity: number;
    userNotes: string | null;
    adminNotes: string | null;
    isAdminSuggestion: boolean;
    adminAlternativeProductId: string | null;
    product: { id: string; normalizedName: string };
  }>;
  prices: Map<string, { finalPriceUsd: number }>;
  title: string;
  highlight?: boolean;
}) {
  if (items.length === 0) return null;
  const subtotal = items.reduce((acc, i) => {
    const unit = prices.get(i.product.id)?.finalPriceUsd ?? 0;
    return acc + unit * i.quantity;
  }, 0);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Table>
        <THead>
          <TR>
            <TH>Producto</TH>
            <TH>Cantidad</TH>
            <TH className="text-right">Precio U.</TH>
            <TH className="text-right">Subtotal</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((i) => {
            const unit = prices.get(i.product.id)?.finalPriceUsd ?? 0;
            return (
              <TR key={i.id} className={highlight ? "bg-accent/5" : undefined}>
                <TD>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/portal/products/${i.product.id}`} className="font-medium hover:underline">
                      {i.product.normalizedName}
                    </Link>
                    {i.isAdminSuggestion ? (
                      <Badge tone="accent">
                        <Sparkles className="h-3 w-3" /> Sugerencia Soundtec
                      </Badge>
                    ) : null}
                  </div>
                  {i.userNotes ? <p className="mt-1 text-xs text-muted-foreground">Nota tuya: {i.userNotes}</p> : null}
                  {i.adminNotes ? (
                    <p className="mt-1 text-xs text-primary">Comentario del equipo: {i.adminNotes}</p>
                  ) : null}
                  {i.adminAlternativeProductId ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Propuesta como alternativa a otro ítem de tu solicitud.
                    </p>
                  ) : null}
                </TD>
                <TD>{i.quantity}</TD>
                <TD className="text-right">{formatUsd(unit)}</TD>
                <TD className="text-right">{formatUsd(unit * i.quantity)}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <div className="flex justify-end text-sm">
        <span className="text-muted-foreground">Subtotal:&nbsp;</span>
        <span className="font-semibold">{formatUsd(subtotal)}</span>
      </div>
    </div>
  );
}

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const request = await prisma.customerRequest.findFirst({
    where: { id, userId: user.id },
    include: {
      items: {
        include: {
          product: { include: { brand: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      messages: { include: { sender: { select: { name: true, role: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!request) notFound();

  const commercialClientId = await resolveCommercialClientId(user.id);
  const globalMargin = await getGlobalMarginPercent();
  const prices = await calculatePricesForProducts(
    request.items.map((i) => ({
      productId: i.product.id,
      baseCostUsd: Number(i.product.baseCostUsd),
      brandId: i.product.brandId,
      distributorId: i.product.distributorId,
      categoryId: i.product.categoryId,
      familyId: i.product.familyId,
      productDiscountPercent: i.product.discountPercent ? Number(i.product.discountPercent) : null,
      tariffDutyPercent: i.product.tariffDutyPercent ? Number(i.product.tariffDutyPercent) : null,
    })),
    commercialClientId,
    globalMargin
  );

  const subtotal = request.items.reduce((acc, i) => {
    const unit = prices.get(i.product.id)?.finalPriceUsd ?? 0;
    return acc + unit * i.quantity;
  }, 0);

  const status = statusMap[request.status] || statusMap.DRAFT;
  const isDraft = request.status === "DRAFT";
  const staffMessages = request.messages.filter((m) => m.sender.role !== "CLIENT");
  const suggestionsItems = request.items.filter((i) => i.isAdminSuggestion);
  const originalItems = request.items.filter((i) => !i.isAdminSuggestion);
  const hasStaffReply = Boolean(request.adminResponse?.trim()) || staffMessages.length > 0;

  return (
    <div className="space-y-6">
      <Link href="/portal/requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a solicitudes
      </Link>

      <PageHeader
        title={isDraft ? "Mi solicitud en armado" : `Solicitud #${request.id.slice(-6).toUpperCase()}`}
        description={
          isDraft
            ? "Agregá productos desde el catálogo y enviá cuando esté lista."
            : `Creada el ${formatDate(request.createdAt)} · Tipo: ${request.type}`
        }
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />

      {isDraft ? (
        <DraftRequestEditor
          requestId={request.id}
          projectDescription={request.projectDescription}
          subtotal={subtotal}
          items={originalItems.map((i) => ({
            id: i.id,
            quantity: i.quantity,
            product: i.product,
            unitPrice: prices.get(i.product.id)?.finalPriceUsd ?? 0,
          }))}
        />
      ) : null}

      {!isDraft && hasStaffReply ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <CardTitle>Respuesta del equipo Soundtec</CardTitle>
            </div>
            {request.adminResponse?.trim() ? (
              <div className="rounded-md border border-border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">Mensaje principal</p>
                <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">{request.adminResponse}</div>
                <p className="mt-2 text-xs text-muted-foreground">Actualizado: {formatDate(request.updatedAt)}</p>
              </div>
            ) : null}
            {staffMessages.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Historial de mensajes</p>
                {staffMessages.map((m) => (
                  <div key={m.id} className="rounded-md border border-primary/15 bg-card p-3 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {m.sender.name} · Soundtec · {formatDate(m.createdAt)}
                      {m.isAiGenerated ? (
                        <Badge tone="accent" className="ml-2">
                          <Sparkles className="h-3 w-3" /> IA
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{m.message}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : !isDraft && request.status !== "SENT" ? (
        <Card className="border-dashed">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Tu solicitud está en estado «{status.label}». El equipo aún no publicó una respuesta escrita.
          </CardContent>
        </Card>
      ) : null}

      {!isDraft && suggestionsItems.length > 0 ? (
        <Card className="border-accent/30">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              <CardTitle>Productos sugeridos por Soundtec</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              El equipo te propone estas alternativas o complementos según tu consulta.
            </p>
            <RequestItemsTable items={suggestionsItems} prices={prices} title="" highlight />
          </CardContent>
        </Card>
      ) : null}

      {!isDraft ? (
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{suggestionsItems.length > 0 ? "Productos que solicitaste" : "Productos"}</CardTitle>
          </div>
          {originalItems.length === 0 && suggestionsItems.length === 0 ? (
            <p className="muted-text">Sin productos en esta solicitud.</p>
          ) : (
            <RequestItemsTable
              items={originalItems.length > 0 ? originalItems : request.items}
              prices={prices}
              title=""
            />
          )}
          <div className="flex justify-end border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Total estimado:&nbsp;</span>
            <span className="text-lg font-semibold">{formatUsd(subtotal)}</span>
          </div>
          <p className="muted-text text-xs">Precios sujetos a confirmación y disponibilidad.</p>
        </CardContent>
      </Card>
      ) : null}

      {!isDraft && request.projectDescription ? (
        <Card>
          <CardContent className="p-6">
            <CardTitle>Descripción del proyecto</CardTitle>
            <p className="muted-text mt-2 whitespace-pre-wrap">{request.projectDescription}</p>
          </CardContent>
        </Card>
      ) : null}

      {!isDraft ? (
      <Card>
        <CardContent className="space-y-3 p-6">
          <CardTitle>Conversación</CardTitle>
          <div className="space-y-2">
            {request.messages.length === 0 ? (
              <p className="muted-text">Sin mensajes todavía.</p>
            ) : (
              request.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-md border p-3 text-sm ${
                    m.sender.role === "CLIENT" ? "border-border bg-card" : "border-primary/20 bg-primary/5"
                  }`}
                >
                  <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {m.sender.name} {m.sender.role !== "CLIENT" ? "· Soundtec" : ""}
                      {m.isAiGenerated ? (
                        <Badge tone="accent" className="ml-2">
                          <Sparkles className="h-3 w-3" /> Sugerido por IA
                        </Badge>
                      ) : null}
                    </span>
                    <span>{formatDate(m.createdAt)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{m.message}</p>
                </div>
              ))
            )}
          </div>

          <form action={postRequestMessage} className="space-y-2 border-t border-border pt-4">
            <input type="hidden" name="requestId" value={request.id} />
            <Label htmlFor="message">Tu mensaje</Label>
            <Textarea id="message" name="message" rows={3} required placeholder="Escribí tu mensaje..." />
            <div className="flex justify-end">
              <Button type="submit">
                <MessageSquare className="h-4 w-4" /> Enviar mensaje
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
