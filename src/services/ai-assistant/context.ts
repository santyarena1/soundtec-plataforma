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

  return scored
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .slice(0, LIMITS.maxSpecsPerProduct)
    .map((entry) => entry.spec);
}

/** Ficha compacta de un producto, en texto plano. */
export function buildProductSheet(
  candidate: CandidateProduct,
  analysis: QuestionAnalysis,
  scope: AssistantScope
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

  if (candidate.shortDescription) {
    lines.push(`Descripción: ${truncate(candidate.shortDescription, 240)}`);
  }

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
    flags.push(`stock ${candidate.admin.stockStatus}${
      candidate.admin.stockQuantity !== null ? ` (${candidate.admin.stockQuantity})` : ""
    }`);
    if (candidate.admin.baseCostUsd !== null) flags.push(`costo base USD ${candidate.admin.baseCostUsd}`);
  }
  if (flags.length > 0) lines.push(`Datos: ${flags.join(" · ")}`);

  // Si la ficha quedó pobre, se completa con la descripción larga o el HTML
  // enriquecido, que es donde suele estar la info de aplicación.
  const soFar = lines.join("\n").length;
  if (soFar < 420) {
    const extra = candidate.longDescription || candidate.htmlText;
    if (extra) lines.push(`Detalle: ${truncate(extra, LIMITS.maxProductSheetChars - soFar - 40)}`);
  }

  return truncate(lines.join("\n"), LIMITS.maxProductSheetChars).replace(/… ?$/, "…");
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

  for (const candidate of candidates) {
    const sheet = buildProductSheet(candidate, analysis, scope);
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
