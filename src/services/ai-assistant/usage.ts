/**
 * Uso y costo real del asistente.
 *
 * Los tokens se guardan en cada respuesta, así que el costo no se estima: se
 * suma. El precio del modelo vive acá porque es el único lugar donde se usa;
 * si cambia la tarifa o el modelo, se toca una constante.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

/**
 * Tarifa por millón de tokens, en USD.
 *
 * Estos valores son solo el punto de partida: la tarifa real la declara el
 * admin desde el panel, porque depende del modelo y del plan de cada cuenta.
 * Los tokens en cambio no se estiman, se miden: van guardados en cada
 * respuesta.
 */
export const DEFAULT_PRICING = {
  inputPerMillion: 0.15,
  outputPerMillion: 0.6,
} as const;

export const PRICING_KEYS = {
  input: "ai.assistant.price_input_per_million",
  output: "ai.assistant.price_output_per_million",
} as const;

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  /** true si los valores los cargó el admin y no son los de fábrica. */
  configured: boolean;
}

function toPrice(raw: string, fallback: number): { value: number; fromSetting: boolean } {
  const parsed = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return { value: fallback, fromSetting: false };
  return { value: parsed, fromSetting: true };
}

export async function getModelPricing(): Promise<ModelPricing> {
  const [rawInput, rawOutput] = await Promise.all([
    getSetting(PRICING_KEYS.input, ""),
    getSetting(PRICING_KEYS.output, ""),
  ]);
  const input = toPrice(rawInput, DEFAULT_PRICING.inputPerMillion);
  const output = toPrice(rawOutput, DEFAULT_PRICING.outputPerMillion);
  return {
    inputPerMillion: input.value,
    outputPerMillion: output.value,
    configured: input.fromSetting && output.fromSetting,
  };
}

export interface UsageSummary {
  pricing: ModelPricing;
  /** Modelo con el que se respondió, tal como quedó registrado. */
  model: string | null;
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

export function costOf(inputTokens: number, outputTokens: number, pricing: ModelPricing): number {
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion
  );
}

export async function getUsageSummary(
  sessionWhere: Prisma.AiChatSessionWhereInput
): Promise<UsageSummary> {
  const where: Prisma.AiChatMessageWhereInput = { role: "assistant", session: sessionWhere };

  const [answers, withModel, cacheHits, totals, pricing, lastModel] = await Promise.all([
    prisma.aiChatMessage.count({ where }),
    prisma.aiChatMessage.count({ where: { ...where, usedLlm: true, cacheHit: false } }),
    prisma.aiChatMessage.count({ where: { ...where, cacheHit: true } }),
    prisma.aiChatMessage.aggregate({
      where,
      _sum: { inputTokens: true, outputTokens: true },
    }),
    getModelPricing(),
    prisma.aiChatMessage.findFirst({
      where: { ...where, model: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { model: true },
    }),
  ]);

  const inputTokens = totals._sum.inputTokens ?? 0;
  const outputTokens = totals._sum.outputTokens ?? 0;
  const costUsd = costOf(inputTokens, outputTokens, pricing);

  return {
    pricing,
    model: lastModel?.model ?? null,
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
