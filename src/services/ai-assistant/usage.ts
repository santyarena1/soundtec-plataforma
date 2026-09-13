/**
 * Uso y costo real del asistente.
 *
 * Los tokens se guardan en cada respuesta, así que el costo no se estima: se
 * suma. El precio del modelo vive acá porque es el único lugar donde se usa;
 * si cambia la tarifa o el modelo, se toca una constante.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** USD por millón de tokens. gpt-4o-mini, tarifa de septiembre de 2026. */
export const MODEL_PRICING = {
  model: "gpt-4o-mini",
  inputPerMillion: 0.15,
  outputPerMillion: 0.6,
} as const;

export interface UsageSummary {
  /** Respuestas del asistente en el período. */
  answers: number;
  /** Las que necesitaron el modelo (no incluye las servidas de cache). */
  withModel: number;
  /** Las que se resolvieron sin gastar un token. */
  withoutModel: number;
  cacheHits: number;
  inputTokens: number;
  outputTokens: number;
  /** Promedio por consulta que usó el modelo. */
  avgInputPerModelCall: number;
  avgOutputPerModelCall: number;
  costUsd: number;
  /** Costo medio de una consulta cualquiera, incluidas las que salen gratis. */
  costPerAnswerUsd: number;
  costPerModelCallUsd: number;
  /** Proyección a 1.000 consultas con la mezcla actual. */
  costPerThousandUsd: number;
}

export function costOf(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * MODEL_PRICING.inputPerMillion +
    (outputTokens / 1_000_000) * MODEL_PRICING.outputPerMillion
  );
}

export async function getUsageSummary(
  sessionWhere: Prisma.AiChatSessionWhereInput
): Promise<UsageSummary> {
  const where: Prisma.AiChatMessageWhereInput = { role: "assistant", session: sessionWhere };

  const [answers, withModel, cacheHits, totals] = await Promise.all([
    prisma.aiChatMessage.count({ where }),
    prisma.aiChatMessage.count({ where: { ...where, usedLlm: true, cacheHit: false } }),
    prisma.aiChatMessage.count({ where: { ...where, cacheHit: true } }),
    prisma.aiChatMessage.aggregate({
      where,
      _sum: { inputTokens: true, outputTokens: true },
    }),
  ]);

  const inputTokens = totals._sum.inputTokens ?? 0;
  const outputTokens = totals._sum.outputTokens ?? 0;
  const costUsd = costOf(inputTokens, outputTokens);

  return {
    answers,
    withModel,
    withoutModel: Math.max(0, answers - withModel),
    cacheHits,
    inputTokens,
    outputTokens,
    avgInputPerModelCall: withModel > 0 ? Math.round(inputTokens / withModel) : 0,
    avgOutputPerModelCall: withModel > 0 ? Math.round(outputTokens / withModel) : 0,
    costUsd,
    costPerAnswerUsd: answers > 0 ? costUsd / answers : 0,
    costPerModelCallUsd: withModel > 0 ? costUsd / withModel : 0,
    costPerThousandUsd: answers > 0 ? (costUsd / answers) * 1000 : 0,
  };
}
