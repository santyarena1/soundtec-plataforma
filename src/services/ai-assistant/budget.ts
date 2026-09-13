/**
 * Presupuesto de contexto. Todo límite del asistente vive acá para poder
 * medirlo y ajustarlo en un solo lugar (ver docs/specs/2026-09-12-...md §4).
 */

import type { QuestionIntent } from "./types";

export const LIMITS = {
  /** Largo máximo del mensaje del visitante. */
  maxQuestionChars: 500,
  /** Candidatos que se traen de la DB antes de recortar. */
  candidateFetchCap: 24,
  /** Caracteres totales de contexto que pueden viajar al LLM. */
  maxContextChars: 6000,
  /** Caracteres de la ficha de un producto. */
  maxProductSheetChars: 900,
  /** Specs por producto en el contexto. */
  maxSpecsPerProduct: 12,
  /** En una comparación conviene ver más filas de cada producto. */
  maxSpecsPerProductComparison: 18,
  /** Relaciones (accesorios/compatibles) por producto. */
  maxRelationsPerProduct: 8,
  /** Features por producto. */
  maxFeaturesPerProduct: 6,
  /** Turnos de historial que se envían. */
  maxHistoryTurns: 2,
  maxHistoryChars: 350,
  /** Tokens de salida del modelo. */
  maxOutputTokens: 550,
  /** Timeout de la llamada al modelo. */
  llmTimeoutMs: 20_000,
  /** TTL de la cache de respuestas. */
  cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
} as const;

/** Cuántos productos entran al contexto según lo que se preguntó. */
export function candidateLimitFor(intent: QuestionIntent): number {
  switch (intent) {
    case "SPEC_LOOKUP":
      return 3;
    case "COMPARISON":
      return 2;
    case "COMPATIBILITY":
    case "ACCESSORY":
      return 4;
    case "RECOMMENDATION":
      return 6;
    default:
      return 5;
  }
}
