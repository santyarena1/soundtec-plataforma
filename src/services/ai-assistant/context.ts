/**
 * Construcción del contexto que ve el modelo.
 *
 * Dos reglas que no se negocian:
 *  1. El costo, los coeficientes y cualquier dato interno NO viajan al prompt
 *     en scope público. No se confía en pedirle al modelo que no los muestre:
 *     el dato no está.
 *  2. El modelo solo puede nombrar etiquetas (P1, P2…). Los IDs reales los
 *     resuelve el backend, así que es imposible que invente un producto.
 */

import { LIMITS } from "./budget";
import type { AssistantScope, CandidateProduct, QuestionAnalysis, SpecRow } from "./types";

const RELATION_LABELS: Record<string, string> = {
  ACCESSORY: "accesorio compatible",
  INCLUDED: "incluido en la caja",
  COMPATIBLE: "compatible con",
  MODEL_VARIANT: "otro modelo de la línea",
  RELATED: "relacionado",
  CROSS_SELL: "suele comprarse junto a",
  ALSO_PURCHASED: "suele comprarse junto a",
};

const ENVIRONMENT_TEXT: Record<string, string> = {
  OUTDOOR: "apto para exterior",
  INDOOR: "para interior",
  BOTH: "interior y exterior",
};

/**
 * Facetas del perfil en una línea. Es información que antes el modelo tenía
 * que deducir leyendo la ficha entera, con el riesgo de equivocarse.
 */
function describeFacets(candidate: CandidateProduct): string {
  const profile = candidate.profile;
  if (!profile) return "";
  const parts: string[] = [];
  if (profile.environment && ENVIRONMENT_TEXT[profile.environment]) {
    parts.push(ENVIRONMENT_TEXT[profile.environment]);
  }
  if (profile.ipRating) parts.push(`protección ${profile.ipRating}`);
  if (profile.mountTypes.length > 0) parts.push(`montaje ${profile.mountTypes.join(", ")}`);
  if (profile.audioLine) {
    parts.push(profile.audioLine === "BOTH" ? "línea 70/100 V" : `línea ${profile.audioLine}`);
  }
  if (profile.powerWatts) parts.push(`${profile.powerWatts} W`);
  if (profile.ecosystems.length > 0) parts.push(`compatible con ${profile.ecosystems.join(", ")}`);
  if (profile.applications.length > 0) parts.push(`usos: ${profile.applications.join(", ")}`);
  return parts.join(" · ");
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Ordena las specs poniendo primero las que responden lo que se preguntó.
 * Así, con un tope de 12 filas, la fila útil entra siempre.
 */
export function prioritizeSpecs(specs: SpecRow[], analysis: QuestionAnalysis): SpecRow[] {
  if (specs.length === 0) return [];
  const matchers = analysis.attributes.flatMap((attribute) => attribute.specMatchers);
  const tokens = analysis.tokens.filter((token) => token.length >= 4);

  const scored = specs.map((spec, index) => {
    const haystack = `${spec.label} ${spec.value}`;
    let score = 0;
    if (matchers.some((matcher) => matcher.test(spec.label))) score += 10;
    else if (matchers.some((matcher) => matcher.test(haystack))) score += 6;
    if (tokens.some((token) => haystack.toLowerCase().includes(token))) score += 2;
    return { spec, score, index };
  });

  const cap =
    analysis.intent === "COMPARISON"
      ? LIMITS.maxSpecsPerProductComparison
      : LIMITS.maxSpecsPerProduct;

  return scored
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .slice(0, cap)
    .map((entry) => entry.spec);
}

/** Ficha compacta de un producto, en texto plano. */
export function buildProductSheet(
  candidate: CandidateProduct,
  analysis: QuestionAnalysis,
  scope: AssistantScope,
  maxChars: number = LIMITS.maxProductSheetChars
): string {
  const lines: string[] = [];
  lines.push(`[${candidate.label}] ${candidate.name}`);

  const identity = [
    candidate.brandName ? `Marca: ${candidate.brandName}` : null,
    candidate.categoryName ? `Categoría: ${candidate.categoryName}` : null,
    candidate.modelNumber ? `Modelo: ${candidate.modelNumber}` : null,
    candidate.internalSku ? `SKU: ${candidate.internalSku}` : null,
  ].filter(Boolean);
  if (identity.length > 0) lines.push(identity.join(" · "));

  // El resumen precomputado dice lo mismo que la descripción del fabricante
  // en la mitad de caracteres y en español. Cuando existe, es la descripción.
  const summary = candidate.profile?.summaryEs;
  if (summary) {
    lines.push(`Resumen: ${truncate(summary, 320)}`);
  } else if (candidate.shortDescription) {
    lines.push(`Descripción: ${truncate(candidate.shortDescription, 240)}`);
  }

  const facets = describeFacets(candidate);
  if (facets) lines.push(`Clasificación: ${facets}`);

  const features = candidate.keyFeatures.slice(0, LIMITS.maxFeaturesPerProduct);
  if (features.length > 0) {
    lines.push(`Destacado: ${features.map((feature) => truncate(feature, 90)).join(" | ")}`);
  }

  const specs = prioritizeSpecs(candidate.specifications, analysis);
  if (specs.length > 0) {
    lines.push(
      `Specs: ${specs.map((spec) => `${truncate(spec.label, 40)}: ${truncate(spec.value, 70)}`).join(" | ")}`
    );
  }

  const relations = candidate.relations.slice(0, LIMITS.maxRelationsPerProduct);
  if (relations.length > 0) {
    lines.push(
      `Relaciones: ${relations
        .map((relation) => `${RELATION_LABELS[relation.kind] ?? "relacionado"}: ${truncate(relation.name, 60)}`)
        .join(" | ")}`
    );
  }

  const flags: string[] = [];
  if (candidate.isCrestronHomeCompatible) flags.push("compatible con Crestron Home");
  if (candidate.isDiscontinued) flags.push("discontinuado por el fabricante");
  if (candidate.isCustomizable) flags.push("configurable");
  if (candidate.weightKg) flags.push(`peso ${candidate.weightKg} kg`);
  const { width, height, depth } = candidate.dimensionsCm;
  if (width || height || depth) {
    flags.push(`medidas ${[width, height, depth].map((value) => value ?? "—").join(" × ")} cm`);
  }
  if (candidate.documents.length > 0) {
    flags.push(`${candidate.documents.length} documento(s) disponibles (contenido no indexado todavía)`);
  }
  if (scope === "ADMIN" && candidate.admin) {
    flags.push(`Stock: ${candidate.admin.stockStatus}${
      candidate.admin.stockQuantity !== null ? ` (${candidate.admin.stockQuantity})` : ""
    }`);
    if (candidate.admin.baseCostUsd !== null) {
      flags.push(`Costo base (dato interno autorizado): USD ${candidate.admin.baseCostUsd}`);
    }
  }
  if (flags.length > 0) lines.push(`Datos: ${flags.join(" · ")}`);

  // Solo si no hay resumen precomputado se recurre al texto largo del
  // fabricante: es caro en tokens y viene en inglés.
  const soFar = lines.join("\n").length;
  if (!summary && soFar < maxChars - 260) {
    const extra = candidate.longDescription || candidate.htmlText;
    if (extra) lines.push(`Detalle: ${truncate(extra, maxChars - soFar - 40)}`);
  }

  return truncate(lines.join("\n"), maxChars).replace(/… ?$/, "…");
}

export interface BuiltContext {
  text: string;
  /** Productos que realmente entraron (los que el modelo puede nombrar). */
  used: CandidateProduct[];
  chars: number;
}

export function buildContext(
  candidates: CandidateProduct[],
  analysis: QuestionAnalysis,
  scope: AssistantScope
): BuiltContext {
  const used: CandidateProduct[] = [];
  const blocks: string[] = [];
  let chars = 0;
  // El presupuesto se reparte: pocos productos = fichas más ricas; un
  // listado largo = fichas más cortas, pero entran todas las opciones.
  const sheetCap =
    candidates.length <= 2
      ? LIMITS.maxProductSheetChars * 2
      : Math.max(
          420,
          Math.min(LIMITS.maxProductSheetChars, Math.floor(LIMITS.maxContextChars / candidates.length))
        );

  for (const candidate of candidates) {
    const sheet = buildProductSheet(candidate, analysis, scope, sheetCap);
    if (chars + sheet.length > LIMITS.maxContextChars && used.length > 0) break;
    blocks.push(sheet);
    used.push(candidate);
    chars += sheet.length;
  }

  return { text: blocks.join("\n\n"), used, chars };
}

/** Historial comprimido: últimos turnos truncados, sin llamadas extra al modelo. */
export function compressHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): Array<{ role: "user" | "assistant"; content: string }> {
  const turns = history.slice(-LIMITS.maxHistoryTurns * 2);
  return turns.map((turn) => ({
    role: turn.role,
    content: truncate(turn.content, LIMITS.maxHistoryChars),
  }));
}
