/**
 * Búsqueda por facetas sobre el perfil precomputado.
 *
 * Diferencia central con la búsqueda vieja: acá el conjunto de resultados es
 * el conjunto completo. Se sabe cuántos hay ("hay 83") y se puede paginar,
 * en vez de devolver las primeras filas que aparecieron y hacer pasar eso por
 * la respuesta.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRODUCT_SELECT, toCandidate, type ProductRow } from "./candidate";
import { cosineSimilarity, embedOne } from "./profile/embedding";
import type { CanonicalFilter } from "./facets";
import type { AssistantScope, CandidateProduct } from "./types";

/** Máximo de filas que se rankean semánticamente en memoria. */
const SEMANTIC_POOL = 400;

export interface FacetSearchInput {
  filter: CanonicalFilter;
  scope: AssistantScope;
  limit: number;
  offset?: number;
  /** Pregunta original; habilita el desempate semántico. */
  question?: string;
  semantic?: boolean;
}

export interface FacetSearchResult {
  candidates: CandidateProduct[];
  /** Total de productos que cumplen el filtro, no los que entraron. */
  total: number;
  /** Condiciones que hubo que soltar para encontrar algo. */
  relaxed: string[];
  usedFilter: CanonicalFilter;
  usedSemantic: boolean;
}

function environmentValues(environment: string): string[] {
  if (environment === "OUTDOOR") return ["OUTDOOR", "BOTH"];
  if (environment === "INDOOR") return ["INDOOR", "BOTH"];
  return [environment];
}

function audioLineValues(audioLine: string): string[] {
  if (audioLine === "70V") return ["70V", "BOTH"];
  if (audioLine === "100V") return ["100V", "BOTH"];
  if (audioLine === "BOTH") return ["BOTH", "70V", "100V"];
  return [audioLine];
}

/**
 * Condición del perfil. Todo lo que acá es una columna, antes era una
 * búsqueda de texto sobre el HTML del fabricante.
 */
export function buildWhere(filter: CanonicalFilter): Prisma.ProductWhereInput {
  const profile: Prisma.ProductAiProfileWhereInput = {};

  if (filter.productType) profile.productType = filter.productType;
  if (filter.environment && filter.environment !== "UNKNOWN") {
    profile.environment = { in: environmentValues(filter.environment) };
  }
  if (filter.audioLine) profile.audioLine = { in: audioLineValues(filter.audioLine) };
  if (filter.ipRating) profile.ipRating = filter.ipRating;
  if (filter.mountTypes.length > 0) profile.mountTypes = { hasSome: filter.mountTypes };
  if (filter.ecosystems.length > 0) profile.ecosystems = { hasEvery: filter.ecosystems };
  if (filter.applications.length > 0) profile.applications = { hasSome: filter.applications };

  const and: Prisma.ProductWhereInput[] = [];
  for (const term of filter.freeTerms) {
    and.push({
      OR: [
        { normalizedName: { contains: term, mode: "insensitive" } },
        { originalName: { contains: term, mode: "insensitive" } },
        { aiProfile: { searchTextEs: { contains: term, mode: "insensitive" } } },
      ],
    });
  }

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    kind: "PRINCIPAL",
    // Un producto sin perfil no puede afirmar nada sobre sus facetas.
    aiProfile: { is: Object.keys(profile).length > 0 ? profile : {} },
  };

  if (filter.brandNames.length > 0) {
    where.brand = { name: { in: filter.brandNames, mode: "insensitive" } };
  }
  if (and.length > 0) where.AND = and;

  // Crestron Home vive además en una columna propia del producto, que es la
  // que carga el enriquecimiento del fabricante: vale como evidencia.
  if (filter.ecosystems.includes("crestron-home")) {
    const profileWithout = { ...profile };
    delete (profileWithout as Record<string, unknown>).ecosystems;
    where.OR = [
      { aiProfile: { is: profile } },
      {
        isCrestronHomeCompatible: true,
        ...(Object.keys(profileWithout).length > 0 ? { aiProfile: { is: profileWithout } } : {}),
      },
    ];
    delete where.aiProfile;
  }

  return where;
}

/**
 * Orden de relajación: primero se sueltan los términos sueltos, después la
 * aplicación y por último el montaje. Nunca se suelta el tipo de producto,
 * el ambiente, el grado IP, la línea de audio ni el ecosistema: eso es
 * exactamente lo que el visitante pidió, y responder otra cosa sería mentir.
 */
const RELAXATION: Array<{ key: keyof CanonicalFilter; label: string }> = [
  { key: "freeTerms", label: "algunos términos de la consulta" },
  { key: "applications", label: "el tipo de instalación" },
  { key: "mountTypes", label: "el tipo de montaje" },
];

export async function facetSearch(input: FacetSearchInput): Promise<FacetSearchResult> {
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.max(1, input.limit);

  let filter: CanonicalFilter = { ...input.filter };
  const relaxed: string[] = [];
  let where = buildWhere(filter);
  let total = await prisma.product.count({ where });

  for (const step of RELAXATION) {
    if (total > 0) break;
    const current = filter[step.key];
    if (!Array.isArray(current) || current.length === 0) continue;
    filter = { ...filter, [step.key]: [] };
    relaxed.push(step.label);
    where = buildWhere(filter);
    total = await prisma.product.count({ where });
  }

  if (total === 0) {
    return { candidates: [], total: 0, relaxed, usedFilter: filter, usedSemantic: false };
  }

  // El desempate semántico solo vale la pena cuando hay más resultados que
  // los que entran y la pregunta tiene matices que las facetas no capturan.
  const wantsSemantic =
    Boolean(input.semantic && input.question) && total > offset + limit && total <= SEMANTIC_POOL;

  if (wantsSemantic) {
    const ranked = await rankSemantically(where, input.question as string, offset, limit);
    if (ranked) {
      return {
        candidates: ranked.map((row, index) => toCandidate(row, index, input.scope)),
        total,
        relaxed,
        usedFilter: filter,
        usedSemantic: true,
      };
    }
  }

  const rows = (await prisma.product.findMany({
    where,
    select: PRODUCT_SELECT,
    orderBy: [{ isDiscontinued: "asc" }, { normalizedName: "asc" }],
    skip: offset,
    take: limit,
  })) as ProductRow[];

  return {
    candidates: rows.map((row, index) => toCandidate(row, index, input.scope)),
    total,
    relaxed,
    usedFilter: filter,
    usedSemantic: false,
  };
}

/**
 * Ranking por cercanía semántica dentro del conjunto que ya cumple el filtro.
 * Se hace en Node sobre vectores de 256 dimensiones: no hace falta pgvector,
 * y el conjunto ya está acotado por las facetas.
 */
async function rankSemantically(
  where: Prisma.ProductWhereInput,
  question: string,
  offset: number,
  limit: number
): Promise<ProductRow[] | null> {
  const [vectorRows, questionVector] = await Promise.all([
    prisma.productAiProfile.findMany({
      where: { product: where },
      select: { productId: true, embedding: true },
      take: SEMANTIC_POOL,
    }),
    embedOne(question),
  ]);
  if (!questionVector || vectorRows.length === 0) return null;

  const usable = vectorRows.filter((row) => row.embedding.length > 0);
  if (usable.length < vectorRows.length / 2) return null;

  const ids = usable
    .map((row) => ({ id: row.productId, score: cosineSimilarity(questionVector, row.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(offset, offset + limit)
    .map((row) => row.id);
  if (ids.length === 0) return null;

  const rows = (await prisma.product.findMany({
    where: { id: { in: ids } },
    select: PRODUCT_SELECT,
  })) as ProductRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is ProductRow => !!row);
}

/** Cobertura de perfiles: sirve para saber si el camino por facetas es confiable. */
let coverageCache: { ratio: number; at: number } | null = null;
const COVERAGE_TTL_MS = 5 * 60 * 1000;

export async function profileCoverage(): Promise<number> {
  if (coverageCache && Date.now() - coverageCache.at < COVERAGE_TTL_MS) return coverageCache.ratio;
  try {
    const [total, withProfile] = await Promise.all([
      prisma.product.count({ where: { isActive: true, kind: "PRINCIPAL" } }),
      prisma.productAiProfile.count({ where: { product: { isActive: true, kind: "PRINCIPAL" } } }),
    ]);
    const ratio = total === 0 ? 0 : withProfile / total;
    coverageCache = { ratio, at: Date.now() };
    return ratio;
  } catch {
    return coverageCache?.ratio ?? 0;
  }
}
