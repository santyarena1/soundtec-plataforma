/**
 * Chat del asistente para el equipo Soundtec. Scope ADMIN: el contexto puede
 * incluir costo base y stock. Solo accesible con sesión admin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { askAssistant } from "@/services/ai-assistant/answer";
import { LIMITS } from "@/services/ai-assistant/budget";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import { getOrCreateSession, loadRecentTurns, recordTurn } from "@/services/ai-assistant/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(LIMITS.maxQuestionChars),
  sessionId: z.string().cuid().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || (role !== "ADMIN" && role !== "SUPER_ADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Consulta inválida." }, { status: 400 });
  }

  try {
    const chat = await getOrCreateSession({
      sessionId: parsed.data.sessionId,
      surface: "ADMIN",
      userId: session.user.id,
      ipHash: hashIp(clientIp(req.headers)),
    });

    const history = await loadRecentTurns(chat.id);
    const answer = await askAssistant({
      question: parsed.data.message,
      scope: "ADMIN",
      surface: "ADMIN",
      sessionId: chat.id,
      activeProductIds: chat.activeProductIds,
      history,
    });
    await recordTurn({ sessionId: chat.id, question: parsed.data.message, answer });

    return NextResponse.json({ ok: true, sessionId: chat.id, ...answer });
  } catch (error) {
    console.error("admin ai chat error", error);
    return NextResponse.json({ ok: false, error: "No se pudo consultar el asistente." }, { status: 500 });
  }
}
