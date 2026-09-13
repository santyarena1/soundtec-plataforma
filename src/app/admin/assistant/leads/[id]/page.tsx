import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Conversación del asistente" };

const STATUS_LABEL: Record<string, string> = {
  ANSWERED: "Respondida",
  PARTIAL: "Parcial",
  INSUFFICIENT_INFORMATION: "Sin datos",
  OUT_OF_SCOPE: "Fuera de tema",
  ERROR: "Error",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  HIGH: "confianza alta",
  MEDIUM: "confianza media",
  LOW: "confianza baja",
};

function statusTone(status: string | null): "success" | "warning" | "destructive" | "muted" {
  if (status === "ANSWERED") return "success";
  if (status === "PARTIAL") return "warning";
  if (status === "ERROR" || status === "INSUFFICIENT_INFORMATION") return "destructive";
  return "muted";
}

export default async function Page({ params }: { params: { id: string } }) {
  await requireAdmin();
  const { id } = params;

  const session = await prisma.aiChatSession.findUnique({
    where: { id },
    include: {
      lead: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) notFound();

  const interestIds = Array.from(
    new Set([
      ...(session.initialProductId ? [session.initialProductId] : []),
      ...(session.lead?.initialProductId ? [session.lead.initialProductId] : []),
      ...(session.lead?.productsOfInterest ?? []),
    ])
  ).slice(0, 20);
  const products = interestIds.length
    ? await prisma.product.findMany({
        where: { id: { in: interestIds } },
        select: { id: true, normalizedName: true, brand: { select: { name: true } } },
      })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const orderedProducts = interestIds.map((pid) => byId.get(pid)).filter((p): p is NonNullable<typeof p> => !!p);

  const lead = session.lead;
  const totalIn = session.messages.reduce((acc, m) => acc + (m.inputTokens ?? 0), 0);
  const totalOut = session.messages.reduce((acc, m) => acc + (m.outputTokens ?? 0), 0);
  const llmCalls = session.messages.filter((m) => m.usedLlm && !m.cacheHit).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead?.name || lead?.company || "Conversación del asistente"}
        description={`Iniciada el ${formatDate(session.startedAt)} · ${session.questionCount} pregunta(s) · origen ${session.surface}`}
        actions={
          <ButtonLink href="/admin/assistant/leads" variant="outline">
            Volver a leads
          </ButtonLink>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium">Datos de contacto</p>
            {lead ? (
              <dl className="space-y-1 text-sm">
                {lead.name ? <Row label="Nombre">{lead.name}</Row> : null}
                {lead.company ? <Row label="Empresa">{lead.company}</Row> : null}
                {lead.email ? (
                  <Row label="Email">
                    <a className="text-primary hover:underline" href={`mailto:${lead.email}`}>
                      {lead.email}
                    </a>
                  </Row>
                ) : null}
                {lead.phone ? (
                  <Row label="Teléfono">
                    <a className="text-primary hover:underline" href={`tel:${lead.phone}`}>
                      {lead.phone}
                    </a>
                  </Row>
                ) : null}
                {lead.projectInfo ? <Row label="Proyecto">{lead.projectInfo}</Row> : null}
                <Row label="Dejados el">{formatDate(lead.createdAt)}</Row>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">El visitante no dejó datos de contacto.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium">Productos consultados</p>
            {orderedProducts.length ? (
              <ul className="space-y-1 text-sm">
                {orderedProducts.map((p) => (
                  <li key={p.id}>
                    <Link className="hover:underline" href={`/admin/products/${p.id}`}>
                      {p.brand?.name ? `${p.brand.name} · ` : ""}
                      {p.normalizedName}
                    </Link>
                    {p.id === session.initialProductId ? (
                      <span className="ml-1 text-xs text-muted-foreground">(QR / inicial)</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No se identificaron productos puntuales.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <p className="font-medium">Uso</p>
            <Row label="Llamadas al modelo">{llmCalls}</Row>
            <Row label="Tokens de entrada">{totalIn}</Row>
            <Row label="Tokens de salida">{totalOut}</Row>
            <Row label="Última actividad">{formatDate(session.lastActivityAt)}</Row>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium">Conversación</p>
          {session.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin mensajes.</p>
          ) : (
            <div className="space-y-3">
              {session.messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <p className="mt-1 text-[10px] opacity-70">{formatDate(m.createdAt)}</p>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2 text-sm">
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {m.answerStatus ? (
                          <Badge tone={statusTone(m.answerStatus)}>{STATUS_LABEL[m.answerStatus] ?? m.answerStatus}</Badge>
                        ) : null}
                        {m.confidence ? <span>{CONFIDENCE_LABEL[m.confidence] ?? m.confidence}</span> : null}
                        <span>Cache: {m.cacheHit ? "sí" : "no"}</span>
                        <span>LLM: {m.usedLlm ? `sí${m.model ? ` (${m.model})` : ""}` : "no"}</span>
                        {m.inputTokens != null ? <span>{m.inputTokens} in / {m.outputTokens ?? 0} out</span> : null}
                        {m.latencyMs != null ? <span>{m.latencyMs} ms</span> : null}
                        {m.productIds.length ? <span>{m.productIds.length} producto(s)</span> : null}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}
