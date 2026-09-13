/**
 * Alta/actualización del lead de Expo. Todos los campos son opcionales;
 * si viene todo vacío no se crea nada.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { saveExpoLead } from "@/services/ai-assistant/leads";
import { checkAssistantLimits, clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import { dismissReminder, getOrCreateSession } from "@/services/ai-assistant/session";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const bodySchema = z.object({
  sessionId: z.string().cuid().optional().nullable(),
  productId: z.string().cuid().optional().nullable(),
  name: z.string().max(160).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  company: z.string().max(160).optional().nullable(),
  projectInfo: z.string().max(2000).optional().nullable(),
  /** El visitante cerró el recordatorio sin dejar datos. */
  dismissed: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Datos inválidos." }, { status: 400 });
  }

  const ipHash = hashIp(clientIp(req.headers));
  try {
    const session = await getOrCreateSession({
      sessionId: parsed.data.sessionId,
      surface: "EXPO",
      initialProductId: parsed.data.productId ?? null,
      ipHash,
    });

    if (parsed.data.dismissed) {
      await dismissReminder(session.id);
      return NextResponse.json({ ok: true, sessionId: session.id, saved: false });
    }

    const limit = await checkAssistantLimits({ sessionId: session.id, ipHash });
    if (!limit.ok) {
      return NextResponse.json({ ok: false, error: "Probá de nuevo en unos segundos." }, { status: 429 });
    }

    const result = await saveExpoLead({
      sessionId: session.id,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      company: parsed.data.company,
      projectInfo: parsed.data.projectInfo,
    });
    if (!result.ok) {
      // Sin datos no es un error para el visitante: sigue al chat igual.
      return NextResponse.json({ ok: true, sessionId: session.id, saved: false });
    }
    return NextResponse.json({ ok: true, sessionId: session.id, saved: true });
  } catch (error) {
    console.error("expo lead error", error);
    return NextResponse.json({ ok: false, error: "No pudimos guardar tus datos." }, { status: 500 });
  }
}
