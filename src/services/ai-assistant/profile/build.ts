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
import { buildSearchText, extractProfile } from "./extract";
import { buildSource, type ProfileSourceRow } from "./source";

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
  aiProfile: { select: { sourceHash: true, embedding: true } },
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

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

/** Cuántos productos faltan procesar (sin perfil o con la ficha cambiada). */
export async function countPending(): Promise<{ total: number; withProfile: number }> {
  const [total, withProfile] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.productAiProfile.count({ where: { product: { isActive: true } } }),
  ]);
  return { total, withProfile };
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

  // Primero los que no tienen perfil; después, los más viejos.
  const rows = (await prisma.product.findMany({
    where: {
      isActive: true,
      ...(options.force ? {} : { aiProfile: { is: null } }),
    },
    select: SOURCE_SELECT,
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  })) as unknown as Array<ProfileSourceRow & { aiProfile: { sourceHash: string } | null }>;

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
    if (!options.force && row.aiProfile?.sourceHash === source.hash) {
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
    // Un grado IP declarado es evidencia de exterior aunque el texto no lo diga.
    const environment =
      profile.environment === "UNKNOWN" && hard.ipRating ? "OUTDOOR" : profile.environment;

    pendingRows.push({
      row,
      hash: source.hash,
      searchText,
      data: {
        productType: profile.productType,
        environment,
        environmentEvidence:
          profile.environmentEvidence ??
          (hard.ipRating ? `Grado de protección declarado: ${hard.ipRating}` : null),
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

  const counts = await countPending();
  stats.pending = Math.max(0, counts.total - counts.withProfile);
  return stats;
}
