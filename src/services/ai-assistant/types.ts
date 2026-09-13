/**
 * Tipos del asistente técnico de productos.
 *
 * Regla del módulo: toda afirmación técnica sale de datos de Soundtec.
 * El modelo nunca aporta hechos nuevos ni IDs; solo redacta sobre el
 * contexto que le pasa el backend.
 */

export type AssistantScope = "PUBLIC" | "ADMIN";
export type AssistantSurface = "PUBLIC" | "ADMIN" | "EXPO";

export type AnswerStatus =
  | "ANSWERED"
  | "PARTIAL"
  | "INSUFFICIENT_INFORMATION"
  | "OUT_OF_SCOPE"
  | "ERROR";

export type AnswerConfidence = "HIGH" | "MEDIUM" | "LOW";

/** Cómo se resolvieron los productos candidatos. */
export type RetrievalMode = "EXACT" | "FACET" | "SEARCH" | "CONTEXT" | "NONE";

export type QuestionIntent =
  | "SPEC_LOOKUP"
  | "COMPARISON"
  | "RECOMMENDATION"
  | "COMPATIBILITY"
  | "ACCESSORY"
  | "GREETING"
  | "GENERAL";

/** Atributo técnico consultado, ya canonizado desde sinónimos. */
export interface AttributeQuery {
  /** Clave canónica interna, p. ej. "ip_rating". */
  key: string;
  /** Etiqueta en español para mostrar al usuario. */
  label: string;
  /** Términos que deben matchear contra el label de una spec. */
  specMatchers: RegExp[];
  /** Si la respuesta puede salir de un campo escalar del producto. */
  productField?: "weight" | "modelNumber" | "isCrestronHomeCompatible" | "dimensions";
}

export interface QuestionAnalysis {
  raw: string;
  normalized: string;
  tokens: string[];
  /** Códigos tipo CP4N, DM-NVX-360, SA68. */
  modelCodes: string[];
  brandNames: string[];
  intent: QuestionIntent;
  attributes: AttributeQuery[];
  /** Términos de aplicación detectados (exterior, restaurante, sala…). */
  applicationTerms: string[];
  /** La pregunta depende del contexto previo ("¿y cuál para exterior?"). */
  isFollowUp: boolean;
  /** "dame 5 opciones" → 5. El visitante manda sobre cualquier tope por defecto. */
  requestedCount?: number;
  /** Consulta de listado del catálogo ("qué parlantes tienen…", "opciones de…"). */
  wantsList: boolean;
}

/**
 * Facetas precomputadas del producto (tabla ProductAiProfile). Es lo que
 * permite responder "¿cuáles son de exterior?" sin releer la ficha entera.
 */
export interface CandidateProfile {
  productType: string | null;
  environment: string | null;
  /** DECLARED: la ficha lo dice. INFERRED: se deduce del tipo de equipo. */
  environmentBasis: string | null;
  environmentEvidence: string | null;
  ipRating: string | null;
  mountTypes: string[];
  audioLine: string | null;
  powerWatts: number | null;
  impedanceOhms: number | null;
  hdmiInputs: number | null;
  ecosystems: string[];
  applications: string[];
  summaryEs: string | null;
}

export interface SpecRow {
  label: string;
  value: string;
  group?: string;
}

export interface DocRow {
  name: string;
  url: string;
  type?: string;
}

/** Producto ya cargado y listo para armar contexto. Sin campos de costo. */
export interface CandidateProduct {
  id: string;
  label: string; // "P1", "P2"… lo único que el LLM puede nombrar
  name: string;
  brandName: string | null;
  categoryName: string | null;
  familyName: string | null;
  internalSku: string | null;
  supplierSku: string | null;
  modelNumber: string | null;
  manufacturerItem: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  htmlText: string | null;
  keyFeatures: string[];
  specifications: SpecRow[];
  documents: DocRow[];
  relations: Array<{ kind: string; name: string; quantity?: number | null }>;
  isCrestronHomeCompatible: boolean;
  isDiscontinued: boolean;
  isCustomizable: boolean;
  weightKg: number | null;
  dimensionsCm: { width: number | null; height: number | null; depth: number | null };
  imageUrl: string | null;
  /** Perfil canónico precomputado. Null mientras no se haya construido. */
  profile: CandidateProfile | null;
  /** Marca de tiempo del producto: alimenta el hash de conocimiento de la cache. */
  updatedAtMs: number;
  /** Solo se completa en scope ADMIN. */
  admin?: {
    baseCostUsd: number | null;
    stockStatus: string;
    stockQuantity: number | null;
  };
}

export type SourceType = "SPECIFICATION" | "PRODUCT_FIELD" | "DESCRIPTION" | "RELATION" | "DOCUMENT";

export interface AnswerSource {
  type: SourceType;
  productId: string;
  productName: string;
  /** "Ficha técnica Soundtec" o el nombre del documento. */
  title: string;
  detail?: string;
  url?: string;
  page?: number;
}

export interface AnswerProduct {
  id: string;
  name: string;
  brandName: string | null;
  imageUrl: string | null;
  href: string;
  reason?: string;
}

/** Estado de un listado paginado: permite "mostrame más" sin rehacer la búsqueda. */
export interface ListingState {
  total: number;
  shown: number;
  offset: number;
  /** Descripción en español de lo que se está listando. */
  description: string;
}

export interface AssistantAnswer {
  answer: string;
  status: AnswerStatus;
  confidence: AnswerConfidence;
  products: AnswerProduct[];
  sources: AnswerSource[];
  suggestions: string[];
  /** Solo en respuestas de listado. */
  listing?: ListingState;
  /**
   * Estado que la sesión tiene que recordar (filtro vigente y paginación).
   * Es interno: la ruta lo persiste y lo saca antes de responderle al visitante.
   */
  state?: { filter: unknown; listingOffset: number };
  meta: {
    usedLlm: boolean;
    cacheHit: boolean;
    latencyMs: number;
    candidateCount: number;
    retrievalMode: RetrievalMode;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface AskInput {
  question: string;
  scope: AssistantScope;
  surface: AssistantSurface;
  sessionId?: string | null;
  /** IDs que la sesión trae como contexto activo. */
  activeProductIds?: string[];
  /** Producto inicial (QR). */
  initialProductId?: string | null;
  /** Últimos turnos ya recortados. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Filtro canónico vigente en la sesión (para refinar y paginar). */
  activeFilter?: unknown;
  /** Cuántos resultados del listado ya se mostraron. */
  listingOffset?: number;
}
