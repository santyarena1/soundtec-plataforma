/**
 * Orquestador del asistente: el único punto que decide si hace falta el
 * modelo y qué se le manda.
 *
 * Tres caminos, de más barato a más caro:
 *   1. Listado por facetas   → 0 tokens. Consultas de catálogo ("cuáles son
 *      de exterior"): el backend ya sabe cuántos hay y cuáles son.
 *   2. Atajo determinístico  → 0 tokens. Un dato puntual de un producto.
 *   3. Una (1) llamada al modelo → cuando hace falta criterio: comparar,
 *      recomendar, interpretar. Nunca dos llamadas.
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
import {
  deserializeFilter,
  describeFilter,
  detectFacets,
  filterWeight,
  isEmptyFilter,
  isMoreRequest,
  mergeFilters,
  serializeFilter,
  type CanonicalFilter,
} from "./facets";
import { facetSearch, profileCoverage } from "./facet-search";
import { analyzeQuestion } from "./intent";
import { askModel } from "./llm";
import {
  buildListingAnswer,
  emptyListingAnswer,
  listingPageSize,
  shouldUseListing,
} from "./listing";
import { buildUserMessage } from "./prompt";
import { getBrandNames, retrieveCandidates } from "./retrieval";
import { LIMITS, candidateLimitFor } from "./budget";
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

/**
 * Cobertura mínima de perfiles para confiar en el camino por facetas.
 * Por debajo de esto el catálogo todavía se está procesando y el filtro
 * daría una foto parcial, así que se usa la búsqueda por texto.
 */
const MIN_COVERAGE = 0.25;

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
function resolveRefs(refs: string[] | undefined, used: CandidateProduct[]): CandidateProduct[] {
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
    const duplicate = out.some((item) => item.productId === candidate.id && item.detail === detail);
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

/**
 * Filtro vigente de la conversación. Una pregunta nueva lo reemplaza; un
 * seguimiento ("¿y con 70V?", "mostrame más") lo refina.
 */
function resolveFilter(input: {
  question: string;
  previous: CanonicalFilter | null;
  detected: CanonicalFilter;
  isFollowUp: boolean;
  isMore: boolean;
}): CanonicalFilter {
  const { previous, detected, isMore, isFollowUp } = input;
  if (!previous || isEmptyFilter(previous)) return detected;
  if (isMore) return previous;
  if (isFollowUp || filterWeight(detected) < filterWeight(previous)) {
    return mergeFilters(previous, detected);
  }
  return detected;
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
      "¿Qué productos son compatibles con Crestron Home?",
    ];
    answer.meta.latencyMs = Date.now() - startedAt;
    return answer;
  }

  const previousFilter = deserializeFilter(input.activeFilter);
  const detected = detectFacets({ question, brandNames, tokens: analysis.tokens });
  const isMore = isMoreRequest(question) && Boolean(previousFilter) && !isEmptyFilter(previousFilter!);
  const filter = resolveFilter({
    question,
    previous: previousFilter,
    detected,
    isFollowUp: analysis.isFollowUp,
    isMore,
  });
  const offset = isMore ? Math.max(0, input.listingOffset ?? 0) : 0;

  const coverage = await profileCoverage();
  const canUseFacets =
    coverage >= MIN_COVERAGE && filterWeight(filter) > 0 && analysis.modelCodes.length === 0;

  // ---------------------------------------------------------------
  // 1) Listado por facetas: la consulta de catálogo, sin modelo.
  // ---------------------------------------------------------------
  if (canUseFacets && (isMore || shouldUseListing(analysis, filter))) {
    const pageSize = listingPageSize(analysis);
    const result = await facetSearch({
      filter,
      scope,
      limit: pageSize,
      offset,
      question,
      semantic: filter.freeTerms.length > 0 || filter.applications.length > 0,
    });

    if (result.total > 0 && result.candidates.length > 0) {
      const answer = buildListingAnswer({
        candidates: result.candidates,
        total: result.total,
        offset,
        filter: result.usedFilter,
        relaxed: result.relaxed,
        scope,
        isContinuation: isMore,
      });
      answer.meta.latencyMs = Date.now() - startedAt;
      answer.state = {
        filter: serializeFilter(result.usedFilter),
        listingOffset: offset + result.candidates.length,
      };
      return answer;
    }

    // El filtro es específico y no hay nada: decirlo es la respuesta correcta.
    if (filterWeight(filter) >= 2) {
      const answer = emptyListingAnswer(filter);
      answer.meta.latencyMs = Date.now() - startedAt;
      answer.state = { filter: serializeFilter(filter), listingOffset: 0 };
      return answer;
    }
  }

  // ---------------------------------------------------------------
  // 2) Candidatos para razonar: facetas primero, texto como respaldo.
  // ---------------------------------------------------------------
  const limit = candidateLimitFor(analysis.intent, {
    requestedCount: analysis.requestedCount,
    wantsList: analysis.wantsList,
  });

  let candidates: CandidateProduct[] = [];
  let retrievalMode: AssistantAnswer["meta"]["retrievalMode"] = "NONE";
  let facetTotal = 0;
  let facetFilter: CanonicalFilter | null = null;

  if (canUseFacets) {
    const result = await facetSearch({
      filter,
      scope,
      limit,
      offset: 0,
      question,
      semantic: true,
    });
    if (result.candidates.length > 0) {
      candidates = result.candidates;
      retrievalMode = "FACET";
      facetTotal = result.total;
      facetFilter = result.usedFilter;
    }
  }

  if (candidates.length === 0) {
    const retrieval = await retrieveCandidates({
      analysis,
      scope,
      activeProductIds: input.activeProductIds,
      initialProductId: input.initialProductId,
    });
    candidates = retrieval.candidates;
    retrievalMode = retrieval.mode;
  }

  if (candidates.length === 0) {
    const answer = noCandidatesAnswer(question);
    answer.suggestions = buildSuggestions({ analysis, candidates: [] });
    answer.meta.latencyMs = Date.now() - startedAt;
    answer.meta.retrievalMode = "NONE";
    return answer;
  }

  const suggestions = buildSuggestions({ analysis, candidates });

  // 3) Cache: misma pregunta, mismos productos, mismo conocimiento.
  const version = knowledgeVersion(candidates);
  const cacheKey = buildCacheKey({
    scope,
    question,
    productIds: candidates.map((candidate) => candidate.id),
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

  // 4) Atajo sin modelo cuando el dato es inequívoco.
  const deterministic = tryDeterministicAnswer({ analysis, candidates, scope });
  if (deterministic) {
    const answer: AssistantAnswer = {
      ...deterministic,
      suggestions,
      meta: {
        ...deterministic.meta,
        latencyMs: Date.now() - startedAt,
        candidateCount: candidates.length,
        retrievalMode,
      },
    };
    await writeCache({ key: cacheKey, scope, question, knowledgeVersion: version, answer });
    return answer;
  }

  // 5) Contexto acotado y una sola llamada al modelo.
  const context = buildContext(candidates, analysis, scope);
  const history = compressHistory(input.history ?? []);
  const filterNote = facetFilter
    ? `Todos los productos del CONTEXTO ya fueron filtrados y cumplen: ${describeFilter(facetFilter)}.` +
      (facetTotal > candidates.length
        ? ` En el catálogo hay ${facetTotal} que cumplen; en el CONTEXTO están los ${candidates.length} más pertinentes, así que podés decir cuántos hay en total.`
        : "")
    : null;

  const userMessage = buildUserMessage({
    question,
    analysis,
    contextText: context.text,
    candidates: context.used,
    history,
    scope,
    filterNote,
  });

  const outcome = await askModel(userMessage, {
    maxTokens:
      analysis.intent === "COMPARISON" ? LIMITS.maxOutputTokensComparison : LIMITS.maxOutputTokens,
  });

  if (!outcome.ok) {
    const latency = Date.now() - startedAt;
    if (outcome.reason === "NOT_CONFIGURED") {
      // Sin API key el asistente no se cae: muestra lo que encontró el buscador.
      return {
        answer: FALLBACK_NO_AI,
        status: "ERROR",
        confidence: "LOW",
        products: candidates.slice(0, 3).map((candidate) => toAnswerProduct(candidate, scope)),
        sources: [],
        suggestions,
        meta: {
          usedLlm: false,
          cacheHit: false,
          latencyMs: latency,
          candidateCount: candidates.length,
          retrievalMode,
        },
      };
    }
    const busy = outcome.reason === "RATE_LIMITED" || outcome.reason === "TIMEOUT";
    return errorAnswer(busy ? FALLBACK_BUSY : FALLBACK_NO_AI, latency, candidates.length);
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
      candidateCount: candidates.length,
      retrievalMode,
      model: outcome.model,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
    },
  };

  if (facetFilter) {
    answer.state = { filter: serializeFilter(facetFilter), listingOffset: 0 };
  }

  if (status === "ANSWERED" || status === "INSUFFICIENT_INFORMATION") {
    await writeCache({ key: cacheKey, scope, question, knowledgeVersion: version, answer });
  }
  return answer;
}
