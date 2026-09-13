/**
 * Sesiones de chat y persistencia de mensajes.
 *
 * La sesión guarda memoria determinística (productos activos) para sostener
 * el contexto sin reenviar toda la conversación al modelo.
 */

import { randomBytes } from "node:crypto";
import type { AiChatSurface } from "@prisma/client";
// Cliente normal: los modelos del asistente no son datos de cliente, así que
// no dependen del guard de tenant.
import { prisma } from "@/lib/prisma";
import { LIMITS } from "./budget";
import type { AssistantAnswer, AssistantSurface } from "./types";

export interface SessionState {
  id: string;
  surface: AssistantSurface;
  questionCount: number;
  leadCaptured: boolean;
  activeProductIds: string[];
  initialProductId: string | null;
  reminderDismissedAt: Date | null;
  reminderShownAt: Date | null;
  /** Filtro canónico vigente: permite refinar y paginar sin rehacer todo. */
  activeFilter: unknown;
  listingOffset: number;
}

export function newAnonymousId(): string {
  return randomBytes(24).toString("base64url");
}

function toState(row: {
  id: string;
  surface: AiChatSurface;
  questionCount: number;
  leadCaptured: boolean;
  activeProductIds: string[];
  initialProductId: string | null;
  reminderDismissedAt: Date | null;
  reminderShownAt: Date | null;
  activeFilterJson: unknown;
  listingOffset: number;
}): SessionState {
  return {
    id: row.id,
    surface: row.surface as AssistantSurface,
    questionCount: row.questionCount,
    leadCaptured: row.leadCaptured,
    activeProductIds: row.activeProductIds,
    initialProductId: row.initialProductId,
    reminderDismissedAt: row.reminderDismissedAt,
    reminderShownAt: row.reminderShownAt,
    activeFilter: row.activeFilterJson ?? null,
    listingOffset: row.listingOffset,
  };
}

export async function getOrCreateSession(input: {
  sessionId?: string | null;
  surface: AssistantSurface;
  userId?: string | null;
  initialProductId?: string | null;
  ipHash?: string | null;
}): Promise<SessionState> {
  if (input.sessionId) {
    const existing = await prisma.aiChatSession.findUnique({ where: { id: input.sessionId } });
    // Una sesión de otra superficie nunca se reutiliza: el scope cambia.
    if (existing && existing.surface === (input.surface as AiChatSurface)) return toState(existing);
  }
  const created = await prisma.aiChatSession.create({
    data: {
      surface: input.surface as AiChatSurface,
      userId: input.userId ?? null,
      anonymousId: input.userId ? null : newAnonymousId(),
      initialProductId: input.initialProductId ?? null,
      ipHash: input.ipHash ?? null,
    },
  });
  return toState(created);
}

/** Últimos turnos, ya recortados para el prompt. */
export async function loadRecentTurns(
  sessionId: string
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const rows = await prisma.aiChatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: LIMITS.maxHistoryTurns * 2,
    select: { role: true, content: true },
  });
  return rows
    .reverse()
    .map((row) => ({
      role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: row.content,
    }));
}

export async function recordTurn(input: {
  sessionId: string;
  question: string;
  answer: AssistantAnswer;
}): Promise<{ questionCount: number; activeProductIds: string[] }> {
  const productIds = input.answer.products.map((product) => product.id);
  // El filtro y la paginación viajan con la respuesta: así "mostrame más"
  // continúa la misma búsqueda en el turno siguiente.
  const state = input.answer.state;

  const [, , session] = await prisma.$transaction([
    prisma.aiChatMessage.create({
      data: {
        sessionId: input.sessionId,
        role: "user",
        content: input.question,
      },
    }),
    prisma.aiChatMessage.create({
      data: {
        sessionId: input.sessionId,
        role: "assistant",
        content: input.answer.answer,
        sourcesJson: input.answer.sources as unknown as object,
        productIds,
        answerStatus: input.answer.status === "ERROR" ? "ERROR" : input.answer.status,
        confidence: input.answer.confidence,
        model: input.answer.meta.model ?? null,
        inputTokens: input.answer.meta.inputTokens ?? null,
        outputTokens: input.answer.meta.outputTokens ?? null,
        latencyMs: input.answer.meta.latencyMs,
        cacheHit: input.answer.meta.cacheHit,
        usedLlm: input.answer.meta.usedLlm,
        retrievalMode: input.answer.meta.retrievalMode,
        candidateCount: input.answer.meta.candidateCount,
      },
    }),
    prisma.aiChatSession.update({
      where: { id: input.sessionId },
      data: {
        questionCount: { increment: 1 },
        lastActivityAt: new Date(),
        // Memoria de la conversación: los últimos productos en juego.
        ...(productIds.length > 0 ? { activeProductIds: productIds.slice(0, 4) } : {}),
        ...(state
          ? {
              activeFilterJson: state.filter as object,
              listingOffset: state.listingOffset,
            }
          : {}),
      },
      select: { questionCount: true, activeProductIds: true },
    }),
  ]);

  return { questionCount: session.questionCount, activeProductIds: session.activeProductIds };
}

export async function markReminderShown(sessionId: string): Promise<void> {
  await prisma.aiChatSession
    .update({ where: { id: sessionId }, data: { reminderShownAt: new Date() } })
    .catch(() => undefined);
}

export async function dismissReminder(sessionId: string): Promise<void> {
  await prisma.aiChatSession
    .update({ where: { id: sessionId }, data: { reminderDismissedAt: new Date() } })
    .catch(() => undefined);
}

/**
 * Decide si mostrar el recordatorio de contacto.
 * Reglas: más de 2 preguntas, sin lead, y como mucho una vez cada 3 preguntas
 * después de que lo cierren. Si ya dejó datos, nunca más.
 */
export function shouldShowLeadReminder(input: {
  questionCount: number;
  leadCaptured: boolean;
  reminderShownAt: Date | null;
  reminderDismissedAt: Date | null;
}): boolean {
  if (input.leadCaptured) return false;
  if (input.questionCount <= 2) return false;
  if (input.reminderDismissedAt) {
    // Después de un "ahora no", se espera a la pregunta 6 y no se insiste más.
    return input.questionCount === 6;
  }
  return !input.reminderShownAt || input.questionCount === 5;
}
