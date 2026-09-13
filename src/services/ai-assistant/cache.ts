/**
 * Cache de respuestas. En una feria las mismas preguntas se repiten mucho
 * ("¿es para exterior?", "¿cuántos watts?"), así que un hit ahorra la
 * llamada entera al modelo.
 *
 * La clave incluye el scope (nunca se sirve una respuesta admin a un
 * visitante) y un hash del conocimiento (si cambia una spec, la clave cambia).
 */

import { createHash } from "node:crypto";
// Cliente normal: los modelos del asistente no son datos de cliente, así que
// no dependen del guard de tenant.
import { prisma } from "@/lib/prisma";
import { LIMITS } from "./budget";
import { normalizeQuestion } from "./intent";
import type { AssistantAnswer, AssistantScope, CandidateProduct } from "./types";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Normaliza la pregunta para que variantes triviales compartan entrada. */
export function cacheNormalizeQuestion(question: string): string {
  return normalizeQuestion(question)
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Versión del conocimiento de los productos que participan. Si cambia una
 * ficha, la respuesta vieja deja de usarse sola.
 */
export function knowledgeVersion(
  candidates: Array<Pick<CandidateProduct, "id" | "updatedAtMs">>
): string {
  const parts = candidates.map((candidate) => `${candidate.id}:${candidate.updatedAtMs}`);
  return sha256(parts.sort().join("|")).slice(0, 16);
}

export function buildCacheKey(input: {
  scope: AssistantScope;
  question: string;
  productIds: string[];
  knowledgeVersion: string;
}): string {
  return sha256(
    [
      input.scope,
      cacheNormalizeQuestion(input.question),
      [...input.productIds].sort().join(","),
      input.knowledgeVersion,
    ].join("||")
  );
}

export async function readCache(key: string, scope: AssistantScope): Promise<AssistantAnswer | null> {
  try {
    const row = await prisma.aiAnswerCache.findUnique({ where: { key } });
    if (!row) return null;
    if (row.scope !== scope) return null;
    if (row.expiresAt.getTime() < Date.now()) return null;
    // No bloquea la respuesta: si falla el contador, no importa.
    void prisma.aiAnswerCache
      .update({ where: { key }, data: { hits: { increment: 1 }, lastUsedAt: new Date() } })
      .catch(() => undefined);
    return row.payload as unknown as AssistantAnswer;
  } catch {
    return null;
  }
}

export async function writeCache(input: {
  key: string;
  scope: AssistantScope;
  question: string;
  knowledgeVersion: string;
  answer: AssistantAnswer;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + LIMITS.cacheTtlMs);
  const payload = { ...input.answer, meta: { ...input.answer.meta, cacheHit: false } };
  try {
    await prisma.aiAnswerCache.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        scope: input.scope,
        question: input.question.slice(0, 500),
        payload: payload as unknown as object,
        knowledgeVersion: input.knowledgeVersion,
        expiresAt,
      },
      update: { payload: payload as unknown as object, lastUsedAt: new Date(), expiresAt },
    });
  } catch {
    // La cache es una optimización: si falla, la respuesta ya se entregó.
  }
}
