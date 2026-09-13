/**
 * Borrado de conversaciones del asistente.
 *
 *   DELETE /api/admin/ai/conversations  body: { ids: [...] }
 *   DELETE /api/admin/ai/conversations  body: { exactQuestion: "texto" }
 *
 * La segunda forma existe para sacar de en medio las pruebas: borra solo las
 * conversaciones en las que TODAS las preguntas son exactamente ese texto, así
 * es imposible llevarse puesta una consulta real de un visitante.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function DELETE(req: NextRequest) {
  await requireAdmin();
  const body = (await req.json().catch(() => ({}))) as {
    ids?: unknown;
    exactQuestion?: unknown;
  };

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 500)
    : [];

  if (ids.length > 0) {
    const { count } = await prisma.aiChatSession.deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ ok: true, deleted: count });
  }

  const exact = typeof body.exactQuestion === "string" ? body.exactQuestion.trim() : "";
  if (!exact || exact.length < 3) {
    return NextResponse.json(
      { ok: false, error: "Indicá las conversaciones a borrar." },
      { status: 400 }
    );
  }

  // Candidatas: las que tienen al menos una pregunta con ese texto exacto.
  const candidates = await prisma.aiChatSession.findMany({
    where: { messages: { some: { role: "user", content: exact } } },
    select: { id: true, messages: { where: { role: "user" }, select: { content: true } } },
    take: 1000,
  });

  // Solo se borran las que no tienen ninguna otra pregunta además de esa.
  const removable = candidates
    .filter((session) => session.messages.every((message) => message.content.trim() === exact))
    .map((session) => session.id);

  if (removable.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, skipped: candidates.length });
  }

  const { count } = await prisma.aiChatSession.deleteMany({ where: { id: { in: removable } } });
  return NextResponse.json({ ok: true, deleted: count, skipped: candidates.length - removable.length });
}
