/**
 * Respuestas que no necesitan modelo: cuestan 0 tokens, responden en ~50 ms
 * y no pueden alucinar porque copian el dato tal cual está en la ficha.
 *
 * Solo se usan cuando el dato es inequívoco (un producto, un atributo, una
 * fila de specs que matchea). Ante cualquier duda, gana el camino con LLM.
 */

import type {
  AnswerSource,
  AssistantAnswer,
  CandidateProduct,
  QuestionAnalysis,
  SpecRow,
} from "./types";

export const SPEC_SOURCE_TITLE = "Ficha técnica Soundtec";

export function productHref(productId: string, scope: "PUBLIC" | "ADMIN"): string {
  return scope === "ADMIN" ? `/admin/products/${productId}` : `/catalogo/${productId}`;
}

export function toAnswerProduct(
  candidate: CandidateProduct,
  scope: "PUBLIC" | "ADMIN",
  reason?: string
) {
  return {
    id: candidate.id,
    name: candidate.name,
    brandName: candidate.brandName,
    imageUrl: candidate.imageUrl,
    href: productHref(candidate.id, scope),
    reason,
  };
}

function specSource(candidate: CandidateProduct, spec: SpecRow): AnswerSource {
  return {
    type: "SPECIFICATION",
    productId: candidate.id,
    productName: candidate.name,
    title: SPEC_SOURCE_TITLE,
    detail: `${spec.label}: ${spec.value}`,
  };
}

function fieldSource(candidate: CandidateProduct, detail: string): AnswerSource {
  return {
    type: "PRODUCT_FIELD",
    productId: candidate.id,
    productName: candidate.name,
    title: SPEC_SOURCE_TITLE,
    detail,
  };
}

/** Busca la fila de specs que responde el atributo consultado. */
function findSpec(candidate: CandidateProduct, matchers: RegExp[]): SpecRow | null {
  const byLabel = candidate.specifications.find((spec) =>
    matchers.some((matcher) => matcher.test(spec.label))
  );
  if (byLabel) return byLabel;
  return null;
}

function baseAnswer(
  answer: string,
  overrides: Partial<AssistantAnswer> = {}
): AssistantAnswer {
  return {
    answer,
    status: "ANSWERED",
    confidence: "HIGH",
    products: [],
    sources: [],
    suggestions: [],
    meta: {
      usedLlm: false,
      cacheHit: false,
      latencyMs: 0,
      candidateCount: 0,
      retrievalMode: "NONE",
    },
    ...overrides,
  };
}

export function greetingAnswer(): AssistantAnswer {
  return baseAnswer(
    "Hola. Soy el asistente técnico de Soundtec: respondo sobre los productos que representamos. " +
      "Podés preguntarme por un modelo puntual, por especificaciones, por compatibilidad o contarme qué necesitás resolver.",
    { confidence: "HIGH", status: "ANSWERED" }
  );
}

export function noCandidatesAnswer(question: string): AssistantAnswer {
  const looksLikeProduct = /[A-Za-z]+\d|\d[A-Za-z]/.test(question);
  return baseAnswer(
    looksLikeProduct
      ? "No encontré ese producto en el catálogo de Soundtec. Revisá el modelo o probá con la marca, y lo busco de nuevo."
      : "No encontré información sobre eso en el catálogo de Soundtec. Contame el modelo, la marca o qué necesitás resolver y lo veo.",
    { status: "INSUFFICIENT_INFORMATION", confidence: "HIGH" }
  );
}

/**
 * Intenta responder sin modelo. Devuelve null si no es seguro hacerlo.
 * Condiciones: un solo producto claro y un atributo reconocido.
 */
export function tryDeterministicAnswer(input: {
  analysis: QuestionAnalysis;
  candidates: CandidateProduct[];
  scope: "PUBLIC" | "ADMIN";
}): AssistantAnswer | null {
  const { analysis, candidates, scope } = input;
  if (analysis.intent === "COMPARISON" || analysis.intent === "RECOMMENDATION") return null;
  if (analysis.attributes.length !== 1) return null;
  if (candidates.length === 0) return null;

  // Un único producto claro: o vino uno solo, o el primero es match exacto.
  const candidate = candidates[0];
  if (candidates.length > 1 && analysis.modelCodes.length === 0) return null;

  const attribute = analysis.attributes[0];
  const product = toAnswerProduct(candidate, scope);

  // a) Campos escalares del producto.
  if (attribute.productField === "isCrestronHomeCompatible") {
    const yes = candidate.isCrestronHomeCompatible;
    return baseAnswer(
      yes
        ? `Sí. ${candidate.name} figura como compatible con Crestron Home en nuestra ficha.`
        : `En nuestra ficha, ${candidate.name} no figura como compatible con Crestron Home. Si necesitás confirmarlo, lo verificamos con el fabricante.`,
      {
        status: yes ? "ANSWERED" : "PARTIAL",
        confidence: yes ? "HIGH" : "MEDIUM",
        products: [product],
        sources: [fieldSource(candidate, `Compatible con Crestron Home: ${yes ? "sí" : "no declarado"}`)],
      }
    );
  }

  if (attribute.productField === "weight" && candidate.weightKg) {
    return baseAnswer(`${candidate.name} pesa ${candidate.weightKg} kg según la ficha técnica.`, {
      products: [product],
      sources: [fieldSource(candidate, `Peso: ${candidate.weightKg} kg`)],
    });
  }

  if (attribute.productField === "modelNumber" && candidate.modelNumber) {
    return baseAnswer(`El modelo es ${candidate.modelNumber}${
      candidate.brandName ? ` (${candidate.brandName})` : ""
    }.`, {
      products: [product],
      sources: [fieldSource(candidate, `Modelo: ${candidate.modelNumber}`)],
    });
  }

  if (attribute.productField === "dimensions") {
    const { width, height, depth } = candidate.dimensionsCm;
    if (width || height || depth) {
      const detail = `${width ?? "—"} × ${height ?? "—"} × ${depth ?? "—"} cm (ancho × alto × profundidad)`;
      return baseAnswer(`${candidate.name} mide ${detail}.`, {
        products: [product],
        sources: [fieldSource(candidate, `Dimensiones: ${detail}`)],
      });
    }
  }

  // b) Fila de especificaciones que matchea el atributo.
  const spec = findSpec(candidate, attribute.specMatchers);
  if (spec) {
    return baseAnswer(`${attribute.label} de ${candidate.name}: ${spec.value}.`, {
      products: [product],
      sources: [specSource(candidate, spec)],
    });
  }

  return null;
}

/**
 * Sugerencias de seguimiento. Determinísticas: dependen de la intención y de
 * los productos en juego, no de una llamada extra al modelo.
 */
export function buildSuggestions(input: {
  analysis: QuestionAnalysis;
  candidates: CandidateProduct[];
}): string[] {
  const { analysis, candidates } = input;
  const out: string[] = [];
  const first = candidates[0];

  if (candidates.length >= 2) {
    out.push(`Comparar ${candidates[0].name.split(" ").slice(0, 3).join(" ")} y ${candidates[1].name
      .split(" ")
      .slice(0, 3)
      .join(" ")}`);
  }
  if (first) {
    if (!analysis.attributes.some((attribute) => attribute.key === "outdoor")) {
      out.push("¿Sirve para exterior?");
    }
    if (first.relations.length > 0 && analysis.intent !== "ACCESSORY") {
      out.push("¿Qué accesorios necesita?");
    }
    if (first.documents.length > 0) out.push("Ver documentación disponible");
    if (analysis.intent !== "SPEC_LOOKUP") out.push("Ver especificaciones principales");
  }
  if (out.length === 0) {
    out.push("Dame 5 opciones de parlantes para exterior", "¿Qué parlantes de embutir en techo tienen?");
  }
  return Array.from(new Set(out)).slice(0, 4);
}
