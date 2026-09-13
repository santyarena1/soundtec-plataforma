/**
 * Chat público del asistente (Expo y catálogo).
 *
 * El scope es SIEMPRE "PUBLIC": se deriva de la ruta, nunca del body, así
 * que desde acá es imposible pedir contexto con costos o datos internos.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { askAssistant } from "@/services/ai-assistant/answer";
import { LIMITS } from "@/services/ai-assistant/budget";
import { checkAssistantLimits, clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import {
  getOrCreateSession,
  loadRecentTurns,
  markReminderShown,
  recordTurn,
  shouldShowLeadReminder,
} from "@/services/ai-assistant/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(LIMITS.maxQuestionChars),
  sessionId: z.string().cuid().optional().nullable(),
  productId: z.string().cuid().optional().nullable(),
  surface: z.enum(["EXPO", "PUBLIC"]).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Consulta inválida." }, { status: 400 });
  }
  const { message, sessionId, productId } = parsed.data;
  const surface = parsed.data.surface ?? "EXPO";

  const ipHash = hashIp(clientIp(req.headers));

  try {
    const session = await getOrCreateSession({
      sessionId,
      surface,
      initialProductId: productId ?? null,
      ipHash,
    });

    const limit = await checkAssistantLimits({ sessionId: session.id, ipHash });
    if (!limit.ok) {
      return NextResponse.json(
        {
          ok: true,
          sessionId: session.id,
          answer:
            "Recibimos muchas consultas desde este dispositivo. Esperá unos segundos y volvé a preguntar.",
          status: "ERROR",
          confidence: "LOW",
          products: [],
          sources: [],
          suggestions: [],
          showLeadReminder: false,
          meta: { usedLlm: false, cacheHit: false, latencyMs: 0, candidateCount: 0, retrievalMode: "NONE" },
        },
        { status: 200, headers: { "Retry-After": String(limit.retryAfterSec ?? 30) } }
      );
    }

    const history = await loadRecentTurns(session.id);

    const answer = await askAssistant({
      question: message,
      scope: "PUBLIC",
      surface,
      sessionId: session.id,
      activeProductIds: session.activeProductIds,
      initialProductId: session.initialProductId ?? productId ?? null,
      history,
      activeFilter: session.activeFilter,
      listingOffset: session.listingOffset,
    });

    const turn = await recordTurn({ sessionId: session.id, question: message, answer });

    const showLeadReminder =
      surface === "EXPO" &&
      shouldShowLeadReminder({
        questionCount: turn.questionCount,
        leadCaptured: session.leadCaptured,
        reminderShownAt: session.reminderShownAt,
        reminderDismissedAt: session.reminderDismissedAt,
      });
    if (showLeadReminder) await markReminderShown(session.id);

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      questionCount: turn.questionCount,
      showLeadReminder,
      ...answer,
      // Estado y tokens son internos: ya se persistieron en la sesión.
      state: undefined,
      meta: { ...answer.meta, inputTokens: undefined, outputTokens: undefined },
    });
  } catch (error) {
    console.error("expo chat error", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "No pude consultar el asistente en este momento. Podés seguir usando el buscador del catálogo.",
      },
      { status: 500 }
    );
  }
}
