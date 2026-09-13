import Link from "next/link";
import { Prisma, type AiChatSurface } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { getUsageSummary } from "@/services/ai-assistant/usage";
import { PricingEditor } from "@/components/expo/pricing-editor";
import { MessagesSquare, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Conversaciones del asistente" };

type Search = { q?: string; surface?: string; days?: string; only?: string; page?: string };

const PAGE_SIZE = 25;
const UNANSWERED = ["INSUFFICIENT_INFORMATION", "ERROR"] as const;

const SURFACE_LABEL: Record<AiChatSurface, string> = {
  EXPO: "Expo",
  PUBLIC: "Catálogo",
  ADMIN: "Equipo",
};

function parseDays(raw: string | undefined): number {
  const value = Number(raw);
  return [7, 30, 90, 365].includes(value) ? value : 30;
}

function surfacesFor(raw: string | undefined): AiChatSurface[] {
  if (raw === "EXPO" || raw === "PUBLIC" || raw === "ADMIN") return [raw];
  if (raw === "all") return ["EXPO", "PUBLIC", "ADMIN"];
  return ["EXPO", "PUBLIC"];
}

/**
 * Qué le pregunta la gente al asistente y qué no pudo responder.
 *
 * Es una pantalla de análisis, no comercial: sirve para descubrir qué le falta
 * al catálogo. Los contactos que dejaron sus datos viven en /admin/assistant/leads.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim();
  const days = parseDays(params.days);
  const page = Math.max(1, Number(params.page) || 1);
  const since = new Date(Date.now() - days * 86400000);
  const surfaces = surfacesFor(params.surface);
  const onlyUnanswered = params.only === "unanswered";

  const sessionWhere: Prisma.AiChatSessionWhereInput = {
    surface: { in: surfaces },
    startedAt: { gte: since },
  };

  // Cada fila de la lista es una pregunta, no una sesión: es lo que se lee.
  const questionWhere: Prisma.AiChatMessageWhereInput = {
    role: "user",
    session: sessionWhere,
    ...(q ? { content: { contains: q, mode: "insensitive" } } : {}),
  };

  const [questions, totalQuestions, sessionCount, leadCount, unansweredCount] = await Promise.all([
    prisma.aiChatMessage.findMany({
      where: questionWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE * (onlyUnanswered ? 4 : 1),
      select: {
        id: true,
        content: true,
        createdAt: true,
        sessionId: true,
        session: { select: { surface: true, leadCaptured: true } },
      },
    }),
    prisma.aiChatMessage.count({ where: questionWhere }),
    prisma.aiChatSession.count({ where: sessionWhere }),
    prisma.aiChatSession.count({ where: { ...sessionWhere, leadCaptured: true } }),
    prisma.aiChatMessage.count({
      where: { role: "assistant", answerStatus: { in: [...UNANSWERED] }, session: sessionWhere },
    }),
  ]);

  const usage = await getUsageSummary(sessionWhere);

  // La respuesta de cada pregunta es el mensaje del asistente que le sigue.
  const answers = await prisma.aiChatMessage.findMany({
    where: {
      role: "assistant",
      sessionId: { in: Array.from(new Set(questions.map((row) => row.sessionId))) },
      createdAt: { gte: questions.length ? questions[questions.length - 1].createdAt : since },
    },
    orderBy: { createdAt: "asc" },
    select: {
      sessionId: true,
      createdAt: true,
      answerStatus: true,
      usedLlm: true,
      cacheHit: true,
      productIds: true,
    },
  });

  const answerFor = (sessionId: string, askedAt: Date) =>
    answers.find((row) => row.sessionId === sessionId && row.createdAt >= askedAt);

  const rows = questions
    .map((question) => ({ question, answer: answerFor(question.sessionId, question.createdAt) }))
    .filter((row) => !onlyUnanswered || (row.answer?.answerStatus && (UNANSWERED as readonly string[]).includes(row.answer.answerStatus)))
    .slice(0, PAGE_SIZE);

  const pages = Math.max(1, Math.ceil(totalQuestions / PAGE_SIZE));
  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) next.set(key, value);
    }
    next.set("page", String(target));
    return `/admin/assistant/conversations?${next.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conversaciones del asistente"
        description="Todo lo que le preguntaron al asistente. Sirve para ver qué busca la gente y qué le falta al catálogo para poder responderlo."
        actions={
          <Link
            href="/admin/assistant/leads"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary"
          >
            <UserPlus className="h-4 w-4" />
            Ver leads
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [totalQuestions, `Preguntas (${days} días)`, null],
          [sessionCount, "Conversaciones", null],
          [leadCount, "Dejaron sus datos", "/admin/assistant/leads"],
          [unansweredCount, "Sin poder responder", "?only=unanswered"],
        ].map(([value, label, href]) => {
          const body = (
            <CardContent className="p-4">
              <p className="text-2xl font-semibold">{value as number}</p>
              <p className="text-xs text-muted-foreground">{label as string}</p>
            </CardContent>
          );
          return href ? (
            <Link key={String(label)} href={String(href)}>
              <Card className="h-full transition-shadow hover:shadow-card">{body}</Card>
            </Link>
          ) : (
            <Card key={String(label)}>{body}</Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-center gap-2">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Buscar en el texto de las preguntas"
              className="min-w-[16rem] flex-1"
            />
            <Select name="surface" defaultValue={params.surface || ""} className="w-auto">
              <option value="">Visitantes</option>
              <option value="EXPO">Solo Expo</option>
              <option value="PUBLIC">Solo catálogo</option>
              <option value="ADMIN">Solo el equipo</option>
              <option value="all">Todos</option>
            </Select>
            <Select name="only" defaultValue={params.only || ""} className="w-auto">
              <option value="">Todas las preguntas</option>
              <option value="unanswered">Solo las que no pudo responder</option>
            </Select>
            <Select name="days" defaultValue={String(days)} className="w-auto">
              <option value="7">Últimos 7 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="365">Último año</option>
            </Select>
            <button className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">Filtrar</button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Uso y costo del modelo</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                {usage.model ?? "gpt-4o-mini"} · USD {usage.pricing.inputPerMillion} por millón de entrada y{" "}
                {usage.pricing.outputPerMillion} de salida
              </span>
              <PricingEditor
                input={usage.pricing.inputPerMillion}
                output={usage.pricing.outputPerMillion}
                configured={usage.pricing.configured}
              />
            </div>
          </div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Costo del período",
                value: `USD ${usage.costUsd.toFixed(2)}`,
                hint: `${usage.answers} respuestas`,
              },
              {
                label: "Costo por consulta",
                value: `USD ${usage.costPerAnswerUsd.toFixed(4)}`,
                hint: `USD ${usage.costPerThousandUsd.toFixed(2)} cada 1.000`,
              },
              {
                label: "Tokens por consulta con modelo",
                value: `${usage.avgInputPerModelCall.toLocaleString("es-AR")} + ${usage.avgOutputPerModelCall.toLocaleString("es-AR")}`,
                hint: "entrada + salida",
              },
              {
                label: "Resueltas sin modelo",
                value: `${usage.answers > 0 ? Math.round((usage.withoutModel / usage.answers) * 100) : 0}%`,
                hint: `${usage.withoutModel} de ${usage.answers}${usage.cacheHits ? ` · ${usage.cacheHits} desde cache` : ""}`,
              },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-lg font-semibold tabular-nums">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-[11px] text-muted-foreground/80">{item.hint}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={<MessagesSquare className="h-6 w-6" />}
              title="Sin preguntas en este período"
              description="Cuando alguien use el asistente desde la Expo o el catálogo, cada consulta va a aparecer acá."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {rows.map(({ question, answer }) => {
                const status = answer?.answerStatus ?? null;
                const failed = status ? (UNANSWERED as readonly string[]).includes(status) : false;
                const partial = status === "PARTIAL";
                return (
                  <li key={question.id}>
                    <Link
                      href={`/admin/assistant/conversations/${question.sessionId}`}
                      className="flex flex-col gap-1.5 px-4 py-3 hover:bg-secondary/40 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <p className="min-w-0 flex-1 text-sm">{question.content}</p>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {failed ? (
                          <Badge tone="destructive">{status === "ERROR" ? "Error" : "Sin datos"}</Badge>
                        ) : partial ? (
                          <Badge tone="warning">Parcial</Badge>
                        ) : (
                          <Badge tone="success">
                            {answer?.productIds.length
                              ? `${answer.productIds.length} producto${answer.productIds.length === 1 ? "" : "s"}`
                              : "Respondida"}
                          </Badge>
                        )}
                        {answer && !answer.usedLlm ? <span>sin modelo</span> : null}
                        {answer?.cacheHit ? <span>cache</span> : null}
                        {question.session.leadCaptured ? <span className="text-primary">dejó datos</span> : null}
                        <span>{SURFACE_LABEL[question.session.surface]}</span>
                        <span className="tabular-nums">{formatDate(question.createdAt)}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {pages > 1 && !onlyUnanswered ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {page} de {pages} · {totalQuestions} preguntas
          </span>
          <div className="flex gap-3">
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
