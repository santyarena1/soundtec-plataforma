/**
 * Construcción por lotes de los perfiles de producto.
 *
 * Idempotente: cada producto guarda el hash de su ficha, así que un producto
 * ya procesado que no cambió no vuelve a gastar un solo token. Se ejecuta en
 * tandas cortas desde el admin para respetar el límite de tiempo de Vercel.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { embedTexts } from "./embedding";
import { buildSearchText, extractProfile, type ExtractedProfile } from "./extract";
import { buildSource, type ProfileSourceRow } from "./source";
import { INDOOR_BY_NATURE } from "./vocab";

const SOURCE_SELECT = {
  id: true,
  normalizedName: true,
  originalName: true,
  shortDescription: true,
  longDescription: true,
  htmlContent: true,
  keyFeatures: true,
  specifications: true,
  sourceMetadata: true,
  sourceCategoryPath: true,
  productLine: true,
  modelNumber: true,
  isCrestronHomeCompatible: true,
  isDiscontinued: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
  family: { select: { name: true } },
  aiProfile: { select: { sourceHash: true, profileVersion: true, builtAt: true } },
} satisfies Prisma.ProductSelect;

export interface BuildStats {
  scanned: number;
  built: number;
  skipped: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  errors: string[];
  /** Productos que todavía no tienen perfil al día. */
  pending: number;
}

export interface BuildOptions {
  /** Cuántos productos procesar en esta tanda. */
  limit?: number;
  /** Rehacer incluso los que no cambiaron. */
  force?: boolean;
  /** Corta la tanda al acercarse al límite de la función. */
  deadlineMs?: number;
}

/**
 * Ambiente final del producto. Se decide en tres pasos, del dato más duro al
 * más blando, y siempre queda registrado con qué respaldo se decidió:
 *  1. Un grado de protección declarado es exterior, diga lo que diga el texto.
 *  2. Un equipo de rack o de cielorraso interior no va a la intemperie.
 *  3. Lo que dijo el modelo.
 * Solo queda sin determinar lo que realmente puede ir en cualquier lado.
 */
export function resolveEnvironment(input: {
  profile: ExtractedProfile;
  ipRating: string | null;
  mountTypes: string[];
}): { environment: string; environmentBasis: string | null; environmentEvidence: string | null } {
  const { profile, ipRating } = input;

  if (ipRating && profile.environment !== "BOTH") {
    return {
      environment: "OUTDOOR",
      environmentBasis: "DECLARED",
      environmentEvidence:
        profile.environment === "OUTDOOR" && profile.environmentBasis === "DECLARED"
          ? profile.environmentEvidence
          : `Grado de protección declarado: ${ipRating}`,
    };
  }

  if (profile.environment !== "UNKNOWN") {
    return {
      environment: profile.environment,
      environmentBasis: profile.environmentBasis,
      environmentEvidence: profile.environmentEvidence,
    };
  }

  // El modelo no se jugó: si el tipo de equipo o el montaje lo resuelven, se
  // resuelve acá y se marca como deducción.
  if (INDOOR_BY_NATURE.includes(profile.productType)) {
    return {
      environment: "INDOOR",
      environmentBasis: "INFERRED",
      environmentEvidence: `Tipo de equipo (${profile.productType}): instalación en interior.`,
    };
  }
  if (input.mountTypes.includes("rack")) {
    return {
      environment: "INDOOR",
      environmentBasis: "INFERRED",
      environmentEvidence: "Equipo de rack: instalación en interior.",
    };
  }

  return { environment: "UNKNOWN", environmentBasis: null, environmentEvidence: null };
}

/**
 * Versión del extractor. Subirla marca todo el catálogo como pendiente:
 * es la forma de propagar un cambio de criterio sin tocar la base a mano.
 *   1 → primera versión.
 *   2 → el ambiente se decide siempre que se pueda, con respaldo declarado o deducido.
 */
export const PROFILE_VERSION = 2;

/** Productos que todavía no tienen un perfil de la versión vigente. */
function pendingWhere(): Prisma.ProductWhereInput {
  return {
    isActive: true,
    OR: [
      { aiProfile: { is: null } },
      { aiProfile: { is: { profileVersion: { lt: PROFILE_VERSION } } } },
    ],
  };
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

/** Cuántos productos faltan procesar (sin perfil o con un perfil viejo). */
export async function countPending(): Promise<{
  total: number;
  withProfile: number;
  pending: number;
}> {
  const [total, withProfile, pending] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.productAiProfile.count({
      where: { product: { isActive: true }, profileVersion: { gte: PROFILE_VERSION } },
    }),
    prisma.product.count({ where: pendingWhere() }),
  ]);
  return { total, withProfile, pending };
}

export async function buildProfiles(options: BuildOptions = {}): Promise<BuildStats> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit ?? DEFAULT_LIMIT));
  const startedAt = Date.now();
  const deadlineMs = options.deadlineMs ?? 240_000;

  const stats: BuildStats = {
    scanned: 0,
    built: 0,
    skipped: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    embeddingTokens: 0,
    errors: [],
    pending: 0,
  };

  // Sin force, solo lo pendiente: los procesados dejan de calificar solos.
  // Con force entra todo, y se empieza por el perfil más viejo; como al
  // reprocesar se actualiza builtAt, cada tanda avanza a los siguientes.
  const rows = (await prisma.product.findMany({
    where: options.force ? { isActive: true } : pendingWhere(),
    select: SOURCE_SELECT,
    orderBy: options.force
      ? [{ aiProfile: { builtAt: "asc" } }, { updatedAt: "desc" }]
      : [{ updatedAt: "desc" }],
    take: limit,
  })) as unknown as Array<
    ProfileSourceRow & { aiProfile: { sourceHash: string; profileVersion: number } | null }
  >;

  const pendingRows: Array<{
    row: ProfileSourceRow;
    hash: string;
    searchText: string;
    data: Prisma.ProductAiProfileCreateWithoutProductInput;
  }> = [];

  for (const row of rows) {
    if (Date.now() - startedAt > deadlineMs) break;
    stats.scanned += 1;

    const source = buildSource(row);
    // Se salta solo si la ficha no cambió Y el perfil ya es de la versión vigente.
    const upToDate =
      row.aiProfile?.sourceHash === source.hash &&
      (row.aiProfile?.profileVersion ?? 0) >= PROFILE_VERSION;
    if (!options.force && upToDate) {
      stats.skipped += 1;
      continue;
    }

    const outcome = await extractProfile(source);
    if (!outcome.ok) {
      stats.failed += 1;
      if (stats.errors.length < 5) {
        stats.errors.push(`${row.normalizedName}: ${outcome.reason}${outcome.message ? ` (${outcome.message})` : ""}`);
      }
      // Sin API key no tiene sentido seguir intentando con los demás.
      if (outcome.reason === "NOT_CONFIGURED") break;
      continue;
    }

    stats.inputTokens += outcome.inputTokens;
    stats.outputTokens += outcome.outputTokens;

    const { profile } = outcome;
    const hard = source.hardFacts;
    const searchText = buildSearchText({
      name: row.normalizedName || row.originalName,
      brandName: row.brand?.name ?? null,
      profile,
      ipRating: hard.ipRating,
      audioLine: hard.audioLine,
    });

    // Los datos duros ganan: salen de la ficha, no del criterio del modelo.
    const mountTypes = Array.from(new Set([...hard.mountTypes, ...profile.mountTypes])).slice(0, 6);
    const ecosystems = Array.from(new Set([...hard.ecosystems, ...profile.ecosystems])).slice(0, 10);
    const { environment, environmentBasis, environmentEvidence } = resolveEnvironment({
      profile,
      ipRating: hard.ipRating,
      mountTypes,
    });

    pendingRows.push({
      row,
      hash: source.hash,
      searchText,
      data: {
        productType: profile.productType,
        environment,
        environmentBasis,
        environmentEvidence,
        ipRating: hard.ipRating,
        mountTypes,
        audioLine: hard.audioLine,
        powerWatts: hard.powerWatts,
        impedanceOhms: hard.impedanceOhms,
        hdmiInputs: hard.hdmiInputs,
        ecosystems,
        applications: profile.applications,
        summaryEs: profile.summaryEs,
        searchTextEs: searchText,
        embedding: [],
        sourceHash: source.hash,
        profileVersion: PROFILE_VERSION,
        model: outcome.model,
        builtAt: new Date(),
      },
    });
  }

  // Los embeddings van en una sola llamada para todo el lote.
  if (pendingRows.length > 0) {
    const embeddings = await embedTexts(
      pendingRows.map((entry) => `${entry.row.normalizedName}. ${entry.data.summaryEs ?? ""} ${entry.searchText}`)
    );
    if (embeddings.ok) {
      stats.embeddingTokens += embeddings.tokens;
      embeddings.vectors.forEach((vector, index) => {
        if (pendingRows[index]) pendingRows[index].data.embedding = vector;
      });
    } else if (stats.errors.length < 5) {
      stats.errors.push(`embeddings: ${embeddings.reason}`);
    }
  }

  for (const entry of pendingRows) {
    try {
      await prisma.productAiProfile.upsert({
        where: { productId: entry.row.id },
        create: { productId: entry.row.id, ...entry.data },
        update: entry.data,
      });
      stats.built += 1;
    } catch (error) {
      stats.failed += 1;
      if (stats.errors.length < 5) {
        stats.errors.push(
          `${entry.row.normalizedName}: no se pudo guardar (${
            error instanceof Error ? error.message.slice(0, 120) : "error"
          })`
        );
      }
    }
  }

  stats.pending = (await countPending()).pending;
  return stats;
}
