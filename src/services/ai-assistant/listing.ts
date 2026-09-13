/**
 * Modo listado: respuestas de catálogo sin pasar por el modelo.
 *
 * "¿Qué productos son compatibles con Crestron Home?" no es una pregunta de
 * criterio, es una consulta. El backend ya sabe cuántos hay y cuáles son, así
 * que redactarla con el modelo sería pagar tokens para enumerar algo que ya
 * está resuelto. Cuesta 0 tokens, responde en decenas de milisegundos y es
 * imposible que invente un producto.
 */

import { describeFilter, filterWeight, type CanonicalFilter } from "./facets";
import { productHref } from "./deterministic";
import {
  ECOSYSTEM_LABEL,
  MOUNT_LABEL,
  type Ecosystem,
  type MountType,
} from "./profile/vocab";
import type {
  AnswerSource,
  AssistantAnswer,
  AssistantScope,
  CandidateProduct,
  QuestionAnalysis,
} from "./types";

/** Cuántos productos se listan por tanda. */
export const LISTING_PAGE_SIZE = 8;
export const LISTING_PAGE_SIZE_MAX = 12;

/**
 * ¿Esta consulta se responde listando? Solo cuando el visitante pide varias
 * opciones y el filtro tiene al menos una condición real. Una recomendación
 * ("necesito algo para un bar") sigue yendo al modelo: ahí hace falta criterio.
 */
export function shouldUseListing(analysis: QuestionAnalysis, filter: CanonicalFilter): boolean {
  if (analysis.modelCodes.length > 0) return false;
  if (
    analysis.intent === "COMPARISON" ||
    analysis.intent === "ACCESSORY" ||
    analysis.intent === "GREETING" ||
    analysis.intent === "RECOMMENDATION"
  ) {
    return false;
  }
  // Un dato puntual se lista solo si además se pidieron varias opciones. Una
  // compatibilidad sin modelo nombrado ("¿qué productos funcionan con Crestron
  // Home?") sí es una consulta de catálogo: la resuelve la regla de abajo.
  if (analysis.intent === "SPEC_LOOKUP" && !analysis.wantsList) return false;
  if (filterWeight(filter) === 0) return false;
  return Boolean(analysis.wantsList || analysis.requestedCount || filterWeight(filter) >= 2);
}

/** Cuántos productos entran en esta tanda. */
export function listingPageSize(analysis: QuestionAnalysis): number {
  if (analysis.requestedCount) {
    return Math.min(LISTING_PAGE_SIZE_MAX, Math.max(1, analysis.requestedCount));
  }
  return LISTING_PAGE_SIZE;
}

/**
 * Por qué este producto está en la lista. Sale del perfil, que a su vez sale
 * de la ficha: es la evidencia que se cita, no una frase de relleno.
 */
export function describeEvidence(candidate: CandidateProduct, filter: CanonicalFilter): string {
  const profile = candidate.profile;
  const parts: string[] = [];

  if (profile?.ipRating) {
    parts.push(`declara ${profile.ipRating}`);
  } else if (filter.environment && profile?.environmentEvidence) {
    // La razón que arma el sistema ya se lee como deducción ("Tipo de
    // equipo…"); anteponerle "se deduce" la vuelve redundante.
    const selfExplaining = /^tipo de equipo/i.test(profile.environmentEvidence);
    const prefix = profile.environmentBasis === "INFERRED" && !selfExplaining ? "se deduce: " : "";
    parts.push(`${prefix}${profile.environmentEvidence.slice(0, 90)}`);
  } else if (filter.environment && profile?.environment) {
    parts.push(
      profile.environment === "BOTH"
        ? "apto para interior y exterior"
        : profile.environment === "OUTDOOR"
          ? "declarado para exterior"
          : "para interior"
    );
  }

  if (filter.mountTypes.length > 0 && profile?.mountTypes?.length) {
    const match = profile.mountTypes.find((mount) => filter.mountTypes.includes(mount as MountType));
    if (match) parts.push(MOUNT_LABEL[match as MountType]);
  }

  if (filter.audioLine && profile?.audioLine) {
    parts.push(profile.audioLine === "BOTH" ? "línea 70/100 V" : `línea ${profile.audioLine}`);
  }

  if (filter.ecosystems.length > 0) {
    const match = filter.ecosystems.find(
      (key) => profile?.ecosystems?.includes(key) || (key === "crestron-home" && candidate.isCrestronHomeCompatible)
    );
    if (match) parts.push(`compatible con ${ECOSYSTEM_LABEL[match as Ecosystem]}`);
  }

  if (parts.length === 0 && profile?.powerWatts) parts.push(`${profile.powerWatts} W`);
  if (parts.length === 0 && candidate.categoryName) parts.push(candidate.categoryName);

  const reason = parts.slice(0, 2).join(" · ");
  return candidate.isDiscontinued ? `${reason}${reason ? " · " : ""}discontinuado` : reason;
}

function sourceFor(candidate: CandidateProduct, detail: string): AnswerSource {
  return {
    type: candidate.profile?.ipRating ? "SPECIFICATION" : "PRODUCT_FIELD",
    productId: candidate.id,
    productName: candidate.name,
    title: "Ficha técnica Soundtec",
    detail: detail || undefined,
  };
}

export interface ListingInput {
  candidates: CandidateProduct[];
  total: number;
  offset: number;
  filter: CanonicalFilter;
  relaxed: string[];
  scope: AssistantScope;
  /** El visitante pidió seguir viendo la misma lista. */
  isContinuation: boolean;
}

export function buildListingAnswer(input: ListingInput): AssistantAnswer {
  const { candidates, total, offset, filter, scope } = input;
  const description = describeFilter(filter);
  const shown = offset + candidates.length;
  const remaining = Math.max(0, total - shown);

  const lines: string[] = [];

  if (input.relaxed.length > 0) {
    lines.push(
      `No encontré exactamente eso, así que solté ${input.relaxed.join(" y ")}. ` +
        `Con el resto de las condiciones hay ${total}.`
    );
  } else if (input.isContinuation) {
    lines.push(`Sigo con ${description}. Van ${shown} de ${total}.`);
  } else if (total === 1) {
    lines.push(`Hay un solo producto que cumple: ${description}.`);
  } else if (total <= candidates.length) {
    lines.push(`Tengo ${total} ${description} en el catálogo. Son estos:`);
  } else {
    lines.push(`Tengo ${total} ${description} en el catálogo. Te muestro ${candidates.length}:`);
  }

  lines.push("");
  for (const candidate of candidates) {
    const reason = describeEvidence(candidate, filter);
    const brand = candidate.brandName ? `${candidate.brandName} ` : "";
    lines.push(`- **${brand}${candidate.name}**${reason ? ` — ${reason}` : ""}`);
  }

  if (remaining > 0) {
    lines.push("");
    lines.push(
      remaining === 1
        ? "Queda 1 más. Pedime «mostrame más» y te lo paso."
        : `Quedan ${remaining} más. Pedime «mostrame más» y sigo.`
    );
  }

  const suggestions: string[] = [];
  if (remaining > 0) suggestions.push("Mostrame más");
  if (!filter.environment) suggestions.push("¿Cuáles sirven para exterior?");
  if (!filter.audioLine && filter.productType === "speaker") suggestions.push("¿Cuáles admiten 70V?");
  if (candidates.length >= 2) {
    suggestions.push(
      `Comparar ${candidates[0].name.split(" ").slice(0, 3).join(" ")} y ${candidates[1].name
        .split(" ")
        .slice(0, 3)
        .join(" ")}`
    );
  }

  return {
    answer: lines.join("\n").trim(),
    status: "ANSWERED",
    confidence: "HIGH",
    products: candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      brandName: candidate.brandName,
      imageUrl: candidate.imageUrl,
      href: productHref(candidate.id, scope),
      reason: describeEvidence(candidate, filter) || undefined,
    })),
    sources: candidates.slice(0, 6).map((candidate) => sourceFor(candidate, describeEvidence(candidate, filter))),
    suggestions: Array.from(new Set(suggestions)).slice(0, 4),
    listing: { total, shown, offset, description },
    meta: {
      usedLlm: false,
      cacheHit: false,
      latencyMs: 0,
      candidateCount: candidates.length,
      retrievalMode: "FACET",
    },
  };
}

/** Nada cumple el filtro: se dice con precisión qué se buscó. */
export function emptyListingAnswer(filter: CanonicalFilter): AssistantAnswer {
  return {
    answer:
      `No encontré ${describeFilter(filter)} en el catálogo de Soundtec. ` +
      "Contame si querés que lo busque con otras condiciones, o preguntame por un modelo puntual.",
    status: "INSUFFICIENT_INFORMATION",
    confidence: "HIGH",
    products: [],
    sources: [],
    suggestions: ["¿Qué parlantes de embutir en techo tienen?", "¿Qué productos son compatibles con Crestron Home?"],
    meta: {
      usedLlm: false,
      cacheHit: false,
      latencyMs: 0,
      candidateCount: 0,
      retrievalMode: "FACET",
    },
  };
}
