"use server";

import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/services/ai-assistant/rate-limit";
import { loadPublicForm } from "@/lib/forms/public";
import { isQuestionType, validateAnswer, type AnswerValue } from "@/lib/forms/types";

export type SubmitFormResult =
  | { ok: true }
  | { ok: false; error: string; blockId?: string };

/**
 * Respuesta de un formulario público (/f/[token]). Sin sesión: valida el enlace,
 * que esté abierto, cada respuesta con las mismas reglas que la pantalla, y
 * limita los envíos por IP. Guarda una copia de las preguntas con la respuesta.
 */
export async function submitFormResponse(input: { token: string; answers: Record<string, unknown>; hp?: string }): Promise<SubmitFormResult> {
  // Campo trampa: invisible para personas; si viene con algo es un bot (se descarta en silencio).
  if (input.hp) return { ok: true };
  const form = await loadPublicForm(input.token);
  if (!form) return { ok: false, error: "Este enlace no es válido." };
  if (!form.open) return { ok: false, error: form.closedReason ?? "Este formulario no recibe respuestas." };

  const requestHeaders = await headers();
  const ipHash = hashIp(clientIp(requestHeaders));
  const limit = await consumeRateLimit(`form:${form.id}:ip:${ipHash}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Recibimos demasiados envíos desde esta conexión. Probá de nuevo en un rato." };

  const answers: Record<string, AnswerValue> = {};
  for (const block of form.blocks) {
    if (!isQuestionType(block.type)) continue;
    const result = validateAnswer(block, input.answers?.[block.id]);
    if (!result.ok) return { ok: false, error: `${block.title || "Una pregunta"}: ${result.error}`, blockId: block.id };
    answers[block.id] = result.value;
  }

  await prisma.formResponse.create({
    data: {
      formId: form.id,
      answers: answers as Prisma.InputJsonValue,
      snapshot: form.blocks
        .filter((b) => isQuestionType(b.type))
        .map((b) => ({ id: b.id, type: b.type, title: b.title })) as Prisma.InputJsonValue,
      ipHash,
      userAgent: requestHeaders.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  return { ok: true };
}
