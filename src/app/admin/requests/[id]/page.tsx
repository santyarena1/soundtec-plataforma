import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { adminUpdateRequest, postRequestMessage, removeRequestItemForm } from "@/server/actions/requests";
import { Button } from "@/components/ui/button";
import { Textarea, Label, Select } from "@/components/ui/input";
import { ArrowLeft, Sparkles } from "lucide-react";
import { formatDate, formatUsd } from "@/lib/utils";
import { calculatePricesForProducts } from "@/lib/pricing";
import { getGlobalMarginPercent } from "@/lib/settings";
import { AiSuggestResponseButton } from "./ai-suggest";
import { AddSuggestionPanel } from "./add-suggestion";

export default async function AdminRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();

  const [request, productsForSuggestion] = await Promise.all([
    prisma.customerRequest.findUnique({
      where: { id },
      include: {
        user: true,
        items: {
          include: { product: { include: { brand: true } } },
          orderBy: { createdAt: "asc" },
        },
        messages: { include: { sender: { select: { name: true, role: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { normalizedName: "asc" },
      select: {
        id: true,
        normalizedName: true,
        internalSku: true,
        brand: { select: { name: true } },
      },
      take: 800,
    }),
  ]);
  if (!request) notFound();

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
    request.userId,
    globalMargin
  );

  const total = request.items.reduce(
    (acc, i) => acc + (prices.get(i.product.id)?.finalPriceUsd ?? 0) * i.quantity,
    0
  );

  return (
    <div className="space-y-6">
      <Link href="/admin/requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a solicitudes
      </Link>

      <PageHeader
        title={`Solicitud #${request.id.slice(-6).toUpperCase()}`}
        description={`${request.user.companyName || request.user.name} · ${request.user.email}`}
        actions={
          <Badge>
            {request.status === "DRAFT"
              ? "Borrador"
              : request.status === "SENT"
                ? "Enviada"
                : request.status === "IN_REVIEW"
                  ? "En revisión"
                  : request.status === "ANSWERED"
                    ? "Respondida"
                    : request.status === "CONFIRMED"
                      ? "Confirmada"
                      : request.status === "REJECTED"
                        ? "Rechazada"
                        : request.status === "CLOSED"
                          ? "Cerrada"
                          : request.status}
          </Badge>
        }
      />

      {request.projectDescription ? (
        <Card>
          <CardContent className="p-6">
            <CardTitle>Descripción del proyecto</CardTitle>
            <p className="muted-text mt-2 whitespace-pre-wrap">{request.projectDescription}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-6">
          <CardTitle>Productos solicitados</CardTitle>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH>Marca</TH>
                  <TH>Cantidad</TH>
                  <TH className="text-right">Precio U.</TH>
                  <TH className="text-right">Subtotal</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {request.items.map((i) => {
                  const unit = prices.get(i.product.id)?.finalPriceUsd ?? 0;
                  return (
                    <TR
                      key={i.id}
                      className={i.isAdminSuggestion ? "bg-accent/10" : ""}
                    >
                      <TD>
                        <Link href={`/admin/products/${i.product.id}`} className="hover:underline">
                          {i.product.normalizedName}
                        </Link>
                        {i.isAdminSuggestion ? (
                          <Badge tone="accent" className="ml-2">
                            <Sparkles className="h-3 w-3" /> Sugerencia
                          </Badge>
                        ) : null}
                        {i.userNotes ? <p className="text-xs text-muted-foreground">📝 {i.userNotes}</p> : null}
                        {i.adminNotes ? (
                          <p className="text-xs text-accent">💬 {i.adminNotes}</p>
                        ) : null}
                      </TD>
                      <TD>{i.product.brand?.name || "—"}</TD>
                      <TD>{i.quantity}</TD>
                      <TD className="text-right">{formatUsd(unit)}</TD>
                      <TD className="text-right">{formatUsd(unit * i.quantity)}</TD>
                      <TD className="text-right">
                        <form action={removeRequestItemForm}>
                          <input type="hidden" name="itemId" value={i.id} />
                          <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                            Quitar
                          </Button>
                        </form>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
          <div className="mt-3 flex justify-end text-sm">
            <span className="text-muted-foreground">Total estimado:&nbsp;</span>
            <span className="font-semibold">{formatUsd(total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <AddSuggestionPanel
            requestId={request.id}
            products={productsForSuggestion.map((p) => ({
              id: p.id,
              name: p.normalizedName,
              sku: p.internalSku,
              brand: p.brand?.name ?? null,
            }))}
            existingItems={request.items
              .filter((i) => !i.isAdminSuggestion)
              .map((i) => ({ id: i.id, productName: i.product.normalizedName }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <CardTitle>Respuesta al cliente</CardTitle>
            <AiSuggestResponseButton requestId={request.id} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            El texto de «Respuesta al cliente» y las sugerencias de productos arriba son visibles en el portal del cliente.
            Si marcás «Confirmada» sin escribir respuesta, el cliente solo verá el cambio de estado.
          </p>
          <form action={adminUpdateRequest} className="mt-3 space-y-3">
            <input type="hidden" name="requestId" value={request.id} />
            <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
              <div>
                <Label htmlFor="status">Estado</Label>
                <Select id="status" name="status" defaultValue={request.status === "DRAFT" ? "ANSWERED" : request.status}>
                  <option value="IN_REVIEW">En revisión</option>
                  <option value="ANSWERED">Respondida (recomendado al contestar)</option>
                  <option value="CONFIRMED">Confirmada</option>
                  <option value="REJECTED">Rechazada</option>
                  <option value="CLOSED">Cerrada</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="adminResponse" required>
                  Respuesta visible al cliente
                </Label>
                <Textarea
                  id="adminResponse"
                  name="adminResponse"
                  rows={8}
                  required
                  defaultValue={request.adminResponse || request.aiSuggestedResponse || ""}
                  placeholder="Hola, gracias por la consulta. Te confirmamos disponibilidad y alternativas..."
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit">Guardar y notificar al cliente</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <CardTitle>Mensajes</CardTitle>
          <div className="mt-3 space-y-2">
            {request.messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-md border p-3 text-sm ${
                  m.sender.role === "CLIENT" ? "border-border bg-card" : "border-primary/20 bg-primary/5"
                }`}
              >
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {m.sender.name} {m.sender.role !== "CLIENT" ? "· Soundtec" : ""}
                    {m.isAiGenerated ? (
                      <Badge tone="accent" className="ml-2">
                        <Sparkles className="h-3 w-3" /> IA
                      </Badge>
                    ) : null}
                  </span>
                  <span>{formatDate(m.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.message}</p>
              </div>
            ))}
          </div>
          <form action={postRequestMessage} className="mt-3 space-y-2">
            <input type="hidden" name="requestId" value={request.id} />
            <Label htmlFor="message">Mensaje interno o al cliente</Label>
            <Textarea id="message" name="message" rows={3} required />
            <div className="flex justify-end">
              <Button type="submit">Enviar mensaje</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
