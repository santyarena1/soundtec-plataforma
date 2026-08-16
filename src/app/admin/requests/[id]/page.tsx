import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, MessagesSquare, PenLine, ShoppingCart } from "lucide-react";
import { getCurrentPermissions, requireAdmin } from "@/lib/auth-helpers";
import { permissionsHave } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatUsd } from "@/lib/utils";
import { calculatePricesForProducts } from "@/lib/pricing";
import { getGlobalMarginPercent } from "@/lib/settings";
import { resolveCommercialClientId } from "@/lib/client-context";
import {
  REQUEST_STATUS_META,
  formatRelative,
  statusTone,
  typeLabel,
  type RequestStatus,
} from "@/lib/request-status";
import { StatusStepper } from "./status-stepper";
import { StatusActions } from "./status-actions";
import { ResponseComposer } from "./response-composer";
import { RequestConversation, type ConversationMessage } from "./request-conversation";
import { RequestItemsPanel, type RequestItemRow } from "./request-items-panel";
import { CreateQuoteCard, type QuotePreviewLine } from "./create-quote-card";

export default async function AdminRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const { permissions } = await getCurrentPermissions();
  const canCreateQuote = permissions.fullAccess || permissionsHave(permissions, "quotes.create");

  const [request, existingQuotes] = await Promise.all([
    prisma.customerRequest.findUnique({
      where: { id },
      include: {
        user: true,
        items: {
          include: { product: { include: { brand: true } } },
          orderBy: { createdAt: "asc" },
        },
        messages: {
          include: { sender: { select: { name: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.quote.findMany({
      where: { sourceRequestId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, status: true, createdAt: true },
    }),
  ]);
  if (!request) notFound();

  // Precios con el cliente comercial real, para que el admin vea lo mismo que ve el cliente.
  const commercialClientId = request.clientId ?? (await resolveCommercialClientId(request.userId));
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

  // Las sugerencias guardan el productId reemplazado; lo mapeamos a un nombre legible.
  const productNameById = new Map(request.items.map((i) => [i.product.id, i.product.normalizedName]));

  const items: RequestItemRow[] = request.items.map((i) => ({
    id: i.id,
    productId: i.product.id,
    productName: i.product.normalizedName,
    brand: i.product.brand?.name ?? null,
    quantity: i.quantity,
    unitPriceUsd: prices.get(i.product.id)?.finalPriceUsd ?? 0,
    userNotes: i.userNotes,
    adminNotes: i.adminNotes,
    isAdminSuggestion: i.isAdminSuggestion,
    replacesProductName: i.adminAlternativeProductId
      ? productNameById.get(i.adminAlternativeProductId) ?? null
      : null,
  }));

  const messages: ConversationMessage[] = request.messages.map((m) => ({
    id: m.id,
    message: m.message,
    senderName: m.sender.name ?? "Sin nombre",
    fromClient: m.sender.role === "CLIENT",
    isAiGenerated: m.isAiGenerated,
    sentAtLabel: formatDate(m.createdAt),
  }));

  const replacedProductNames = new Set(
    items.filter((i) => i.isAdminSuggestion && i.replacesProductName).map((i) => i.replacesProductName as string)
  );
  const quotePreviewLines: QuotePreviewLine[] = items.map((i) => {
    const replaced = !i.isAdminSuggestion && replacedProductNames.has(i.productName);
    return {
      role: replaced ? "optional" : "main",
      name: i.productName,
      quantity: i.quantity,
      unitPriceUsd: i.unitPriceUsd,
      note: replaced
        ? "Queda opcional: el equipo propuso una alternativa."
        : i.replacesProductName
          ? `En reemplazo de ${i.replacesProductName}`
          : i.isAdminSuggestion
            ? "Sugerencia del equipo"
            : null,
    };
  });

  const requestedTotal = items
    .filter((i) => !i.isAdminSuggestion)
    .reduce((acc, i) => acc + i.unitPriceUsd * i.quantity, 0);
  const suggestedTotal = items
    .filter((i) => i.isAdminSuggestion)
    .reduce((acc, i) => acc + i.unitPriceUsd * i.quantity, 0);
  const totalUnits = items.reduce((acc, i) => acc + i.quantity, 0);

  const status = request.status as RequestStatus;
  const statusMeta = REQUEST_STATUS_META[status];
  const StatusIcon = statusMeta.icon;
  const clientName = request.user.companyName || request.user.name || request.user.email || "el cliente";
  const lastMessage = request.messages[request.messages.length - 1];
  const waitingOnUs = status === "SENT" || lastMessage?.sender.role === "CLIENT";

  return (
    <div className="space-y-6">
      <Link
        href="/admin/requests"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a solicitudes
      </Link>

      <PageHeader
        title={`Solicitud #${request.id.slice(-6).toUpperCase()}`}
        description={`${typeLabel(request.type)} de ${clientName} · recibida ${formatRelative(request.createdAt)}`}
        actions={
          <Badge tone={statusTone(status)}>
            <StatusIcon className="h-3.5 w-3.5" />
            {statusMeta.label}
          </Badge>
        }
      />

      <StatusStepper status={status} />

      {waitingOnUs && status !== "REJECTED" && status !== "CLOSED" ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
            <PenLine className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Te toca a vos</p>
            <p className="text-xs text-muted-foreground">
              {status === "SENT"
                ? "Nadie tomó esta solicitud todavía. Revisá los productos y respondele al cliente."
                : `${lastMessage?.sender.name ?? "El cliente"} escribió último y está esperando respuesta.`}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="p-6 pt-6">
              <CardTitle>Qué pidió el cliente</CardTitle>
              {request.projectDescription ? (
                <p className="mt-3 whitespace-pre-wrap text-sm">{request.projectDescription}</p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No escribió una descripción del proyecto. Guiate por los productos y la conversación.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 pt-6">
              <div className="mb-4 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Productos</CardTitle>
              </div>
              <RequestItemsPanel requestId={request.id} items={items} />
            </CardContent>
          </Card>

          <Card className="border-primary/30">
            <CardContent className="p-6 pt-6">
              <CardTitle>Responder al cliente</CardTitle>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">
                Este es el paso principal: el texto queda como respuesta oficial en el portal del cliente y también se
                publica en la conversación.
              </p>
              <ResponseComposer
                requestId={request.id}
                currentStatus={request.status}
                savedResponse={request.adminResponse ?? ""}
                storedAiSuggestion={request.aiSuggestedResponse ?? ""}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 pt-6">
              <div className="mb-4 flex items-center gap-2">
                <MessagesSquare className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Conversación</CardTitle>
                <Badge tone="muted">{messages.length}</Badge>
              </div>
              <RequestConversation requestId={request.id} messages={messages} clientName={clientName} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardContent className="p-5 pt-5">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Cliente</CardTitle>
              </div>
              <p className="mt-3 text-sm font-medium">{clientName}</p>
              {request.user.companyName && request.user.name ? (
                <p className="text-xs text-muted-foreground">Contacto: {request.user.name}</p>
              ) : null}
              <a href={`mailto:${request.user.email}`} className="mt-1 block break-all text-xs text-accent hover:underline">
                {request.user.email}
              </a>
              {request.clientId ? (
                <Link
                  href={`/admin/clients/${request.clientId}`}
                  className="mt-3 inline-block text-xs text-accent hover:underline"
                >
                  Ver ficha del cliente →
                </Link>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 pt-5">
              <CardTitle>Resumen</CardTitle>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Tipo" value={typeLabel(request.type)} />
                <Row label="Productos" value={`${items.length} (${totalUnits} u.)`} />
                <Row label="Pedido del cliente" value={formatUsd(requestedTotal)} />
                {suggestedTotal > 0 ? (
                  <Row label="Sugerencias" value={formatUsd(suggestedTotal)} accent />
                ) : null}
                <div className="border-t border-border pt-2">
                  <Row label="Total estimado" value={formatUsd(requestedTotal + suggestedTotal)} strong />
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Precios con el margen y los descuentos de este cliente. Es lo mismo que ve él en el portal.
              </p>
            </CardContent>
          </Card>

          <CreateQuoteCard
            requestId={request.id}
            canCreate={canCreateQuote}
            lines={quotePreviewLines}
            existingQuotes={existingQuotes.map((q) => ({
              id: q.id,
              number: q.number,
              status: q.status,
              createdAtLabel: formatDate(q.createdAt),
            }))}
          />

          <Card>
            <CardContent className="p-5 pt-5">
              <CardTitle>Cambiar estado</CardTitle>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">Ahora está en «{statusMeta.label}».</p>
              <StatusActions requestId={request.id} currentStatus={request.status} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 pt-5">
              <CardTitle>Actividad</CardTitle>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Creada" value={formatDate(request.createdAt)} />
                <Row label="Última actualización" value={formatRelative(request.updatedAt)} />
                <Row label="Mensajes" value={String(messages.length)} />
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`text-right tabular-nums ${strong ? "text-base font-semibold" : "text-sm"} ${
          accent ? "text-accent" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
