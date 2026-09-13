import Link from "next/link";
import { Prisma, type AiChatSurface } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Leads del asistente" };

type Search = {
  q?: string;
  surface?: string;
  lead?: string;
  days?: string;
  page?: string;
  size?: string;
};

const SURFACE_LABEL: Record<AiChatSurface, string> = {
  EXPO: "EXPO",
  PUBLIC: "PUBLIC",
  ADMIN: "ADMIN",
};

const SURFACE_TONE: Record<AiChatSurface, "accent" | "primary" | "muted"> = {
  EXPO: "accent",
  PUBLIC: "primary",
  ADMIN: "muted",
};

const UNANSWERED = ["INSUFFICIENT_INFORMATION", "ERROR"] as const;

function parseDays(raw: string | undefined): number {
  const value = Number(raw);
  return [7, 30, 90].includes(value) ? value : 30;
}

function surfacesFor(raw: string | undefined): AiChatSurface[] {
  if (raw === "EXPO" || raw === "PUBLIC" || raw === "ADMIN") return [raw];
  if (raw === "all") return ["EXPO", "PUBLIC", "ADMIN"];
  return ["EXPO", "PUBLIC"];
}

export default async function Page({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const params = searchParams;
  const q = params.q?.trim();
  const size = params.size === "50" ? 50 : 25;
  const page = Math.max(1, Number(params.page) || 1);
  const days = parseDays(params.days);
  const since = new Date(Date.now() - days * 86400000);
  const surfaces = surfacesFor(params.surface);

  const where: Prisma.AiChatSessionWhereInput = {
    surface: { in: surfaces },
    startedAt: { gte: since },
    ...(params.lead === "yes" ? { leadCaptured: true } : {}),
    ...(params.lead === "no" ? { leadCaptured: false } : {}),
    ...(q
      ? {
          OR: [
            { lead: { name: { contains: q, mode: "insensitive" } } },
            { lead: { company: { contains: q, mode: "insensitive" } } },
            { lead: { email: { contains: q, mode: "insensitive" } } },
            { lead: { phone: { contains: q, mode: "insensitive" } } },
            { messages: { some: { role: "user", content: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [sessions, total, sessionsInPeriod, leadsInPeriod, questionsInPeriod, unansweredInPeriod, unansweredRecent] =
    await Promise.all([
      prisma.aiChatSession.findMany({
        where,
        skip: (page - 1) * size,
        take: size,
        orderBy: [{ lastActivityAt: "desc" }],
        include: {
          lead: { select: { name: true, company: true, email: true, phone: true } },
          messages: {
            where: { role: "user" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { content: true },
          },
        },
      }),
      prisma.aiChatSession.count({ where }),
      prisma.aiChatSession.count({ where }),
      prisma.aiChatSession.count({ where: { AND: [where, { leadCaptured: true }] } }),
      prisma.aiChatMessage.count({ where: { role: "user", session: where } }),
      prisma.aiChatMessage.count({
        where: { role: "assistant", answerStatus: { in: [...UNANSWERED] }, session: where },
      }),
      prisma.aiChatMessage.findMany({
        where: { role: "assistant", answerStatus: { in: [...UNANSWERED] }, session: where },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, sessionId: true, createdAt: true, answerStatus: true },
      }),
    ]);

  // La pregunta que no pudimos responder es el mensaje del visitante
  // inmediatamente anterior a cada respuesta fallida.
  const unansweredQuestions = await Promise.all(
    unansweredRecent.map(async (reply) => {
      const question = await prisma.aiChatMessage.findFirst({
        where: { sessionId: reply.sessionId, role: "user", createdAt: { lte: reply.createdAt } },
        orderBy: { createdAt: "desc" },
        select: { content: true },
      });
      return { ...reply, question: question?.content ?? null };
    })
  );

  const initialIds = Array.from(
    new Set(sessions.map((s) => s.initialProductId).filter((id): id is string => !!id))
  );
  const initialProducts = initialIds.length
    ? await prisma.product.findMany({
        where: { id: { in: initialIds } },
        select: { id: true, normalizedName: true },
      })
    : [];
  const productName = new Map(initialProducts.map((p) => [p.id, p.normalizedName]));

  const pages = Math.max(1, Math.ceil(total / size));
  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) next.set(key, value);
    }
    next.set("page", String(target));
    return `/admin/assistant/leads?${next.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads del asistente"
        description="Todo lo que dejan los visitantes del asistente de productos: datos de contacto, productos consultados y la conversación completa."
        actions={
          <Link href="/admin/assistant" className="text-sm text-primary hover:underline">
            Abrir el asistente
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [sessionsInPeriod, `Conversaciones (${days} días)`],
          [leadsInPeriod, "Leads con datos de contacto"],
          [questionsInPeriod, "Preguntas recibidas"],
          [unansweredInPeriod, "Preguntas sin respuesta"],
        ].map(([n, l]) => (
          <Card key={String(l)}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold">{n}</p>
              <p className="text-xs text-muted-foreground">{l}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {unansweredQuestions.length > 0 ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium">Preguntas que no pudimos responder</p>
            <p className="text-xs text-muted-foreground">
              Sirven para ver qué le falta al catálogo o a las fichas.
            </p>
            <ul className="mt-3 space-y-1.5">
              {unansweredQuestions.map((row) => (
                <li key={row.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>
                  <Link href={`/admin/assistant/leads/${row.sessionId}`} className="min-w-0 flex-1 truncate hover:underline">
                    {row.question ?? "(sin texto)"}
                  </Link>
                  <Badge tone={row.answerStatus === "ERROR" ? "destructive" : "warning"}>
                    {row.answerStatus === "ERROR" ? "Error" : "Sin datos"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-2 md:grid-cols-6">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Nombre, empresa, email, teléfono o texto de la pregunta"
              className="md:col-span-2"
            />
            <Select name="surface" defaultValue={params.surface || ""}>
              <option value="">Visitantes (Expo + catálogo)</option>
              <option value="EXPO">Solo Expo</option>
              <option value="PUBLIC">Solo catálogo</option>
              <option value="all">Incluir admin</option>
            </Select>
            <Select name="lead" defaultValue={params.lead || ""}>
              <option value="">Con o sin datos</option>
              <option value="yes">Dejaron datos de contacto</option>
              <option value="no">Sin datos de contacto</option>
            </Select>
            <Select name="days" defaultValue={String(days)}>
              <option value="7">Últimos 7 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
            </Select>
            <Select name="size" defaultValue={String(size)}>
              <option value="25">25 por página</option>
              <option value="50">50 por página</option>
            </Select>
            <button className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground md:col-start-6">
              Aplicar filtros
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {!sessions.length ? (
            <TableEmpty message="No hay conversaciones con esos filtros." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Inicio</TH>
                  <TH>Origen</TH>
                  <TH>Contacto</TH>
                  <TH>Primera pregunta</TH>
                  <TH>Producto inicial</TH>
                  <TH>Preguntas</TH>
                  <TH>Dejó lead</TH>
                  <TH>Última actividad</TH>
                </TR>
              </THead>
              <TBody>
                {sessions.map((s) => {
                  const lead = s.lead;
                  const contactTitle = lead?.name || lead?.company || lead?.email || lead?.phone;
                  return (
                    <TR key={s.id}>
                      <TD>
                        <Link className="font-medium hover:underline" href={`/admin/assistant/leads/${s.id}`}>
                          {formatDate(s.startedAt)}
                        </Link>
                      </TD>
                      <TD>
                        <Badge tone={SURFACE_TONE[s.surface]}>{SURFACE_LABEL[s.surface]}</Badge>
                      </TD>
                      <TD>
                        {contactTitle ? (
                          <>
                            <p className="font-medium">{contactTitle}</p>
                            <p className="text-xs text-muted-foreground">
                              {[lead?.company && lead.company !== contactTitle ? lead.company : null, lead?.email, lead?.phone]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin datos</span>
                        )}
                      </TD>
                      <TD className="max-w-xs">
                        <p className="truncate text-sm">{s.messages[0]?.content ?? "—"}</p>
                      </TD>
                      <TD>
                        {s.initialProductId ? (
                          <Link className="text-sm hover:underline" href={`/admin/products/${s.initialProductId}`}>
                            {productName.get(s.initialProductId) ?? "Ver producto"}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD>{s.questionCount}</TD>
                      <TD><Badge tone={s.leadCaptured ? "success" : "muted"}>{s.leadCaptured ? "Sí" : "No"}</Badge></TD>
                      <TD className="text-xs text-muted-foreground">{formatDate(s.lastActivityAt)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {page} de {pages} · {total} conversaciones
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link className="hover:underline" href={pageHref(page - 1)}>
                Anterior
              </Link>
            ) : null}
            {page < pages ? (
              <Link className="hover:underline" href={pageHref(page + 1)}>
                Siguiente
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
