/**
 * Resolución de productos candidatos. Todo Postgres, 0 tokens.
 *
 * Orden: match exacto por identificador → búsqueda tolerante (reusa
 * product-search) → productos del contexto de la conversación.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildProductSearchWhere,
  productTokenOr,
  searchRank,
  sortBySearchRelevance,
} from "@/lib/product-search";
import { normalizeForSearch } from "@/lib/search-key";
import { LIMITS, candidateLimitFor } from "./budget";
import { expandSearchTerms } from "./synonyms";
import type {
  AssistantScope,
  CandidateProduct,
  DocRow,
  QuestionAnalysis,
  RetrievalMode,
  SpecRow,
} from "./types";

const PRODUCT_SELECT = {
  id: true,
  updatedAt: true,
  enrichedAt: true,
  internalSku: true,
  supplierSku: true,
  modelNumber: true,
  manufacturerItem: true,
  normalizedName: true,
  originalName: true,
  shortDescription: true,
  longDescription: true,
  htmlContent: true,
  keyFeatures: true,
  specifications: true,
  documents: true,
  sourceCategoryPath: true,
  isCrestronHomeCompatible: true,
  isDiscontinued: true,
  isCustomizable: true,
  weight: true,
  widthCm: true,
  heightCm: true,
  depthCm: true,
  baseCostUsd: true,
  stockStatus: true,
  stockQuantity: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
  family: { select: { name: true } },
  images: { select: { url: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 },
  accessories: {
    select: {
      kind: true,
      quantity: true,
      accessoryProduct: { select: { id: true, normalizedName: true, isActive: true } },
    },
    take: 24,
  },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parseSpecs(value: unknown): SpecRow[] {
  const out: SpecRow[] = [];
  for (const raw of asArray(value)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const label = text(row.labelEs) || text(row.label) || text(row.name);
    const val = text(row.valueEs) || text(row.value);
    if (!label || !val) continue;
    out.push({ label, value: val, group: text(row.group) || undefined });
  }
  return out;
}

function parseDocs(value: unknown): DocRow[] {
  const out: DocRow[] = [];
  for (const raw of asArray(value)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const name = text(row.nameEs) || text(row.name);
    const url = text(row.url);
    if (!name || !url) continue;
    out.push({ name, url, type: text(row.type) || undefined });
  }
  return out;
}

function parseFeatures(value: unknown): string[] {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item : text((item as Record<string, unknown>)?.text)))
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function htmlToText(html: string | null): string | null {
  if (!html) return null;
  const plain = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return plain || null;
}

function toNumber(value: Prisma.Decimal | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toCandidate(row: ProductRow, index: number, scope: AssistantScope): CandidateProduct {
  const relations = row.accessories
    .filter((rel) => rel.accessoryProduct?.isActive)
    .map((rel) => ({
      kind: rel.kind as string,
      name: rel.accessoryProduct.normalizedName,
      quantity: rel.quantity,
    }));

  const candidate: CandidateProduct = {
    id: row.id,
    label: `P${index + 1}`,
    name: row.normalizedName || row.originalName,
    brandName: row.brand?.name ?? null,
    categoryName: row.category?.name ?? null,
    familyName: row.family?.name ?? null,
    internalSku: row.internalSku,
    supplierSku: row.supplierSku,
    modelNumber: row.modelNumber,
    manufacturerItem: row.manufacturerItem,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    htmlText: htmlToText(row.htmlContent),
    keyFeatures: parseFeatures(row.keyFeatures),
    specifications: parseSpecs(row.specifications),
    documents: parseDocs(row.documents),
    relations,
    isCrestronHomeCompatible: row.isCrestronHomeCompatible,
    isDiscontinued: row.isDiscontinued,
    isCustomizable: row.isCustomizable,
    weightKg: toNumber(row.weight),
    dimensionsCm: {
      width: toNumber(row.widthCm),
      height: toNumber(row.heightCm),
      depth: toNumber(row.depthCm),
    },
    imageUrl: row.images[0]?.url ?? null,
    updatedAtMs: Math.max(row.updatedAt?.getTime() ?? 0, row.enrichedAt?.getTime() ?? 0),
  };

  // El costo y el stock solo existen para el scope admin: en público el dato
  // ni siquiera se copia al objeto que después arma el prompt.
  if (scope === "ADMIN") {
    candidate.admin = {
      baseCostUsd: toNumber(row.baseCostUsd),
      stockStatus: row.stockStatus,
      stockQuantity: row.stockQuantity,
    };
  }
  return candidate;
}

/** Búsqueda por identificador exacto (SKU, modelo, searchKey). */
async function findByCodes(codes: string[]): Promise<ProductRow[]> {
  if (codes.length === 0) return [];
  const or: Prisma.ProductWhereInput[] = [];
  for (const code of codes) {
    const trimmed = code.trim();
    const normalized = normalizeForSearch(trimmed);
    or.push(
      { internalSku: { equals: trimmed, mode: "insensitive" } },
      { supplierSku: { equals: trimmed, mode: "insensitive" } },
      { modelNumber: { equals: trimmed, mode: "insensitive" } },
      { manufacturerItem: { equals: trimmed, mode: "insensitive" } }
    );
    if (normalized.length >= 3) or.push({ searchKey: { contains: normalized } });
  }
  return prisma.product.findMany({
    where: { isActive: true, OR: or },
    select: PRODUCT_SELECT,
    take: LIMITS.candidateFetchCap,
  });
}

/** Búsqueda tolerante: la misma que usa el catálogo. */
async function findBySearch(query: string): Promise<ProductRow[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];
  const where = buildProductSearchWhere(clean);
  if (!where.AND) return [];
  return prisma.product.findMany({
    where: { isActive: true, ...where },
    select: PRODUCT_SELECT,
    orderBy: [{ isDiscontinued: "asc" }, { kind: "asc" }, { normalizedName: "asc" }],
    take: LIMITS.candidateFetchCap,
  });
}

async function findByIds(ids: string[]): Promise<ProductRow[]> {
  if (ids.length === 0) return [];
  return prisma.product.findMany({
    where: { id: { in: ids.slice(0, 8) } },
    select: PRODUCT_SELECT,
  });
}

/**
 * Query de búsqueda: se quitan las muletillas para no arrastrar la
 * pregunta entera al `contains` de Postgres.
 */
function searchQueryFrom(analysis: QuestionAnalysis): string {
  const parts = [...analysis.modelCodes, ...analysis.brandNames];
  const meaningful = analysis.tokens.filter(
    (token) =>
      token.length >= 3 &&
      !analysis.modelCodes.some((code) => code.toLowerCase().includes(token)) &&
      !/^(cuanto|cuantos|cuantas|cual|cuales|donde|como|sirve|tiene|modelo|producto|productos)$/.test(token)
  );
  parts.push(...meaningful.slice(0, 5));
  return Array.from(new Set(parts)).join(" ").trim();
}

/** Palabras que no ayudan a encontrar un producto. */
const GENERIC_TOKENS = new Set([
  "producto", "productos", "modelo", "modelos", "marca", "marcas", "tienen", "tiene", "hay",
  "sirve", "sirven", "puedo", "quiero", "cual", "cuales", "que", "como", "donde", "para",
  "tipo", "tipos", "opcion", "opciones", "info", "informacion",
]);

/**
 * Las specs y los key features viven en columnas JSON, así que el buscador
 * del catálogo no los alcanza. Para "¿qué parlantes tienen IP66?" el dato
 * está justo ahí, así que se consulta el JSON como texto.
 */
function jsonMatchers(term: string): Prisma.ProductWhereInput[] {
  if (term.length < 3) return [];
  const variants = Array.from(new Set([term, term.toUpperCase()]));
  return variants.flatMap((value) => [
    { specifications: { string_contains: value } },
    { keyFeatures: { string_contains: value } },
  ]);
}

/** Texto del producto contra el que se cuentan los términos que matchean. */
function haystackOf(row: ProductRow): string {
  return [
    row.normalizedName,
    row.originalName,
    row.brand?.name,
    row.category?.name,
    row.family?.name,
    row.shortDescription,
    row.sourceCategoryPath,
    parseFeatures(row.keyFeatures).join(" "),
    parseSpecs(row.specifications)
      .map((spec) => `${spec.label} ${spec.value}`)
      .join(" "),
    (row.htmlContent ?? "").slice(0, 4000),
    (row.longDescription ?? "").slice(0, 1500),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Búsqueda por concepto: OR entre términos (incluida su traducción al
 * inglés) y ranking por cuántos términos distintos aparecen en la ficha.
 */
async function findByConcept(analysis: QuestionAnalysis, limit: number): Promise<ProductRow[]> {
  const base = [
    ...analysis.brandNames,
    ...analysis.applicationTerms,
    ...analysis.tokens.filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token)),
  ];
  const terms = expandSearchTerms(base, 8);
  if (terms.length === 0) return [];

  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      kind: "PRINCIPAL",
      OR: terms.flatMap((term) => [...productTokenOr(term), ...jsonMatchers(term)]),
    },
    select: PRODUCT_SELECT,
    take: LIMITS.candidateFetchCap * 3,
  });
  if (rows.length === 0) return [];

  // Los términos de aplicación (exterior, hotel…) pesan más que una palabra suelta.
  const strong = new Set(expandSearchTerms(analysis.applicationTerms, 12));

  return rows
    .map((row) => {
      const haystack = haystackOf(row);
      let score = 0;
      for (const term of terms) {
        if (!haystack.includes(term)) continue;
        score += strong.has(term) ? 3 : 1;
      }
      if (row.isDiscontinued) score -= 2;
      return { row, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.row);
}

export interface RetrievalResult {
  candidates: CandidateProduct[];
  mode: RetrievalMode;
  /** Total de filas evaluadas antes de recortar (para analytics). */
  scanned: number;
}

export async function retrieveCandidates(input: {
  analysis: QuestionAnalysis;
  scope: AssistantScope;
  activeProductIds?: string[];
  initialProductId?: string | null;
}): Promise<RetrievalResult> {
  const { analysis, scope } = input;
  const limit = candidateLimitFor(analysis.intent);
  const contextIds = [
    ...(input.initialProductId ? [input.initialProductId] : []),
    ...(input.activeProductIds ?? []),
  ];

  // 1) Identificadores exactos.
  const exact = await findByCodes(analysis.modelCodes);
  if (exact.length > 0) {
    const ordered = sortBySearchRelevance(exact, analysis.modelCodes.join(" "), (row) => row).slice(0, limit);
    return {
      candidates: ordered.map((row, index) => toCandidate(row, index, scope)),
      mode: "EXACT",
      scanned: exact.length,
    };
  }

  // 2) Pregunta de seguimiento sin códigos: seguimos con lo que ya se hablaba.
  if (analysis.isFollowUp && contextIds.length > 0) {
    const rows = await findByIds(contextIds);
    if (rows.length > 0) {
      const byId = new Map(rows.map((row) => [row.id, row]));
      const ordered = contextIds.map((id) => byId.get(id)).filter((row): row is ProductRow => !!row);
      return {
        candidates: ordered.slice(0, limit).map((row, index) => toCandidate(row, index, scope)),
        mode: "CONTEXT",
        scanned: rows.length,
      };
    }
  }

  // 3) Sin un modelo puntual, la pregunta es sobre el catálogo ("qué
  // parlantes tienen IP66"): conviene abrir la búsqueda por concepto en vez
  // de exigir que todos los términos caigan en el mismo producto. Además hay
  // que buscar en inglés, que es el idioma de las fichas del fabricante.
  if (analysis.modelCodes.length === 0) {
    const wide = await findByConcept(analysis, limit);
    if (wide.length > 0) {
      return {
        candidates: wide.map((row, index) => toCandidate(row, index, scope)),
        mode: "SEARCH",
        scanned: wide.length,
      };
    }
  }

  // 4) Búsqueda tolerante por contenido (todos los términos).
  const query = searchQueryFrom(analysis);
  const found = await findBySearch(query);
  if (found.length > 0) {
    const ranked = found
      .map((row) => ({ row, rank: searchRank(row, query) }))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.row.isDiscontinued !== b.row.isDiscontinued) return a.row.isDiscontinued ? 1 : -1;
        return 0;
      })
      .map((entry) => entry.row);
    return {
      candidates: ranked.slice(0, limit).map((row, index) => toCandidate(row, index, scope)),
      mode: "SEARCH",
      scanned: found.length,
    };
  }

  // 4) Último recurso: el contexto de la conversación.
  if (contextIds.length > 0) {
    const rows = await findByIds(contextIds);
    if (rows.length > 0) {
      return {
        candidates: rows.slice(0, limit).map((row, index) => toCandidate(row, index, scope)),
        mode: "CONTEXT",
        scanned: rows.length,
      };
    }
  }

  return { candidates: [], mode: "NONE", scanned: 0 };
}

/** Lista de marcas activas, cacheada en el isolate (se usa para detectar marcas en la pregunta). */
let brandCache: { names: string[]; at: number } | null = null;
const BRAND_CACHE_MS = 5 * 60 * 1000;

export async function getBrandNames(): Promise<string[]> {
  if (brandCache && Date.now() - brandCache.at < BRAND_CACHE_MS) return brandCache.names;
  try {
    const rows = await prisma.brand.findMany({
      where: { isActive: true },
      select: { name: true },
      take: 300,
    });
    const names = rows.map((row) => row.name);
    brandCache = { names, at: Date.now() };
    return names;
  } catch {
    return brandCache?.names ?? [];
  }
}
