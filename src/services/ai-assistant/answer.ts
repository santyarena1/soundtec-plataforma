/**
 * Orquestador del asistente: es el único punto que decide si hace falta el
 * modelo y qué se le manda.
 *
 * Camino: análisis → retrieval → cache → atajo determinístico → LLM →
 * validación contra la base. Como máximo UNA llamada al modelo por consulta.
 */

import { buildContext, compressHistory } from "./context";
import { buildCacheKey, knowledgeVersion, readCache, writeCache } from "./cache";
import {
  buildSuggestions,
  greetingAnswer,
  noCandidatesAnswer,
  toAnswerProduct,
  tryDeterministicAnswer,
  SPEC_SOURCE_TITLE,
} from "./deterministic";
import { analyzeQuestion } from "./intent";
import { askModel } from "./llm";
import { buildUserMessage } from "./prompt";
import { getBrandNames, retrieveCandidates, structuredFilterNote } from "./retrieval";
import { LIMITS } from "./budget";
import type {
  AnswerConfidence,
  AnswerSource,
  AnswerStatus,
  AskInput,
  AssistantAnswer,
  CandidateProduct,
} from "./types";

const FALLBACK_NO_AI =
  "Por ahora no puedo razonar sobre esa consulta. Probá preguntando por un modelo puntual " +
  "o usá el buscador del catálogo, que sigue funcionando normalmente.";

const FALLBACK_BUSY =
  "Hay muchas consultas en este momento. Probá de nuevo en unos segundos: mientras tanto podés " +
  "seguir usando el buscador del catálogo.";

function errorAnswer(text: string, latencyMs: number, candidateCount: number): AssistantAnswer {
  return {
    answer: text,
    status: "ERROR",
    confidence: "LOW",
    products: [],
    sources: [],
    suggestions: [],
    meta: {
      usedLlm: false,
      cacheHit: false,
      latencyMs,
      candidateCount,
      retrievalMode: "NONE",
    },
  };
}

/**
 * Traduce las etiquetas del modelo (P1, P2…) a productos reales.
 * Si el modelo nombra algo que no está en el contexto, se descarta.
 */
function resolveRefs(
  refs: string[] | undefined,
  used: CandidateProduct[]
): CandidateProduct[] {
  if (!refs?.length) return [];
  const byLabel = new Map(used.map((candidate) => [candidate.label.toUpperCase(), candidate]));
  const out: CandidateProduct[] = [];
  for (const ref of refs) {
    const candidate = byLabel.get(String(ref).trim().toUpperCase());
    if (candidate && !out.some((item) => item.id === candidate.id)) out.push(candidate);
  }
  return out.slice(0, 8);
}

function buildSources(
  sourceRefs: Array<{ ref: string; detail?: string }> | undefined,
  used: CandidateProduct[]
): AnswerSource[] {
  if (!sourceRefs?.length) return [];
  const byLabel = new Map(used.map((candidate) => [candidate.label.toUpperCase(), candidate]));
  const out: AnswerSource[] = [];
  for (const source of sourceRefs) {
    const candidate = byLabel.get(String(source.ref).trim().toUpperCase());
    if (!candidate) continue;
    const detail = source.detail?.trim().slice(0, 300);
    const duplicate = out.some(
      (item) => item.productId === candidate.id && item.detail === detail
    );
    if (duplicate) continue;
    out.push({
      type: "SPECIFICATION",
      productId: candidate.id,
      productName: candidate.name,
      title: SPEC_SOURCE_TITLE,
      detail,
    });
  }
  return out.slice(0, 6);
}

/** Si el modelo no citó nada pero nombró productos, al menos se cita la ficha. */
function ensureSources(sources: AnswerSource[], products: CandidateProduct[]): AnswerSource[] {
  if (sources.length > 0) return sources;
  return products.slice(0, 3).map((candidate) => ({
    type: "SPECIFICATION" as const,
    productId: candidate.id,
    productName: candidate.name,
    title: SPEC_SOURCE_TITLE,
  }));
}

export async function askAssistant(input: AskInput): Promise<AssistantAnswer> {
  const startedAt = Date.now();
  const question = input.question.trim().slice(0, LIMITS.maxQuestionChars);
  const scope = input.scope;

  const brandNames = await getBrandNames();
  const analysis = analyzeQuestion(question, brandNames);

  if (analysis.intent === "GREETING") {
    const answer = greetingAnswer();
    answer.suggestions = [
      "¿Qué parlantes de embutir en techo tienen?",
      "Dame 5 opciones de parlantes para exterior",
      "¿Qué parlantes tienen protección IP66?",
    ];
    answer.meta.latencyMs = Date.now() - startedAt;
    return answer;
  }

  const retrieval = await retrieveCandidates({
    analysis,
    scope,
    activeProductIds: input.activeProductIds,
    initialProductId: input.initialProductId,
  });

  if (retrieval.candidates.length === 0) {
    const answer = noCandidatesAnswer(question);
    answer.suggestions = buildSuggestions({ analysis, candidates: [] });
    answer.meta.latencyMs = Date.now() - startedAt;
    answer.meta.retrievalMode = "NONE";
    return answer;
  }

  const suggestions = buildSuggestions({ analysis, candidates: retrieval.candidates });

  // 1) Cache: misma pregunta, mismos productos, mismo conocimiento.
  const version = knowledgeVersion(retrieval.candidates);
  const cacheKey = buildCacheKey({
    scope,
    question,
    productIds: retrieval.candidates.map((candidate) => candidate.id),
    knowledgeVersion: version,
  });
  const cached = await readCache(cacheKey, scope);
  if (cached) {
    return {
      ...cached,
      suggestions: cached.suggestions?.length ? cached.suggestions : suggestions,
      meta: { ...cached.meta, cacheHit: true, latencyMs: Date.now() - startedAt },
    };
  }

  // 2) Atajo sin modelo cuando el dato es inequívoco.
  const deterministic = tryDeterministicAnswer({ analysis, candidates: retrieval.candidates, scope });
  if (deterministic) {
    const answer: AssistantAnswer = {
      ...deterministic,
      suggestions,
      meta: {
        ...deterministic.meta,
        latencyMs: Date.now() - startedAt,
        candidateCount: retrieval.candidates.length,
        retrievalMode: retrieval.mode,
      },
    };
    await writeCache({ key: cacheKey, scope, question, knowledgeVersion: version, answer });
    return answer;
  }

  // 3) Contexto acotado y una sola llamada al modelo.
  const context = buildContext(retrieval.candidates, analysis, scope);
  const history = compressHistory(input.history ?? []);
  const userMessage = buildUserMessage({
    question,
    analysis,
    contextText: context.text,
    candidates: context.used,
    history,
    scope,
    filterNote: structuredFilterNote(analysis),
  });

  const outcome = await askModel(userMessage, {
    maxTokens:
      analysis.intent === "COMPARISON"
        ? LIMITS.maxOutputTokensComparison
        : LIMITS.maxOutputTokens,
  });

  if (!outcome.ok) {
    const latency = Date.now() - startedAt;
    if (outcome.reason === "NOT_CONFIGURED") {
      // Sin API key el asistente no se cae: muestra lo que encontró el buscador.
      return {
        answer: FALLBACK_NO_AI,
        status: "ERROR",
        confidence: "LOW",
        products: retrieval.candidates.slice(0, 3).map((candidate) => toAnswerProduct(candidate, scope)),
        sources: [],
        suggestions,
        meta: {
          usedLlm: false,
          cacheHit: false,
          latencyMs: latency,
          candidateCount: retrieval.candidates.length,
          retrievalMode: retrieval.mode,
        },
      };
    }
    const busy = outcome.reason === "RATE_LIMITED" || outcome.reason === "TIMEOUT";
    return errorAnswer(busy ? FALLBACK_BUSY : FALLBACK_NO_AI, latency, retrieval.candidates.length);
  }

  const products = resolveRefs(outcome.data.productRefs, context.used);
  const status = (outcome.data.status ?? "ANSWERED") as AnswerStatus;
  let confidence = (outcome.data.confidence ?? "MEDIUM") as AnswerConfidence;
  const sources =
    status === "INSUFFICIENT_INFORMATION" || status === "OUT_OF_SCOPE"
      ? []
      : ensureSources(buildSources(outcome.data.sourceRefs, context.used), products);

  // Sin evidencia citada no se sostiene una afirmación categórica.
  if (sources.length === 0 && status === "ANSWERED") confidence = "LOW";

  const answer: AssistantAnswer = {
    answer: outcome.data.answer.trim(),
    status,
    confidence,
    products: products.map((candidate) => toAnswerProduct(candidate, scope)),
    sources,
    suggestions,
    meta: {
      usedLlm: true,
      cacheHit: false,
      latencyMs: Date.now() - startedAt,
      candidateCount: retrieval.candidates.length,
      retrievalMode: retrieval.mode,
      model: outcome.model,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
    },
  };

  if (status === "ANSWERED" || status === "INSUFFICIENT_INFORMATION") {
    await writeCache({ key: cacheKey, scope, question, knowledgeVersion: version, answer });
  }
  return answer;
}
