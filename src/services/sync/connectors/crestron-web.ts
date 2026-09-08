/**
 * Conector de enriquecimiento desde crestron.com.
 *
 * Recorre los productos Crestron ya existentes (creados por el sync de precios
 * de Xtrabone), resuelve la ficha pública por material number y trae
 * descripciones, specs, imágenes, documentos, badges y relaciones.
 * NO escribe precio ni stock: eso sigue siendo dominio del conector "crestron".
 */

import { prisma } from "@/lib/prisma";
import { translateBatchCached } from "@/services/translation-cache";
import { enrichCrestronProduct } from "@/services/crestron-web/enrich";
import {
  toFailedNormalizedProduct,
  toNormalizedProduct,
  type CrestronTargetProduct,
} from "@/services/crestron-web/normalize";
import type { NormalizedProduct, ProductSourceConnector } from "../types";

const CONCURRENCY = 3;
const PAUSE_BETWEEN_PRODUCTS_MS = 250;
const TRANSLATION_DOMAIN =
  "Crestron — control, automatización, AV profesional y colaboración B2B";

interface Candidate extends CrestronTargetProduct {
  id: string;
  vendorProductUrl: string | null;
}

function crestronWhere() {
  return {
    isActive: true,
    internalSku: { not: null },
    brand: { name: { equals: "CRESTRON", mode: "insensitive" as const } },
  };
}

async function loadCandidates(offset: number, take: number): Promise<{ items: Candidate[]; total: number }> {
  const [total, rows] = await Promise.all([
    prisma.product.count({ where: crestronWhere() }),
    prisma.product.findMany({
      where: crestronWhere(),
      orderBy: { internalSku: "asc" },
      skip: offset,
      take,
      select: {
        id: true,
        internalSku: true,
        normalizedName: true,
        originalName: true,
        modelNumber: true,
        vendorProductUrl: true,
      },
    }),
  ]);
  const items = rows
    .filter((row): row is typeof row & { internalSku: string } => !!row.internalSku)
    .map((row) => ({
      id: row.id,
      internalSku: row.internalSku,
      normalizedName: row.normalizedName,
      originalName: row.originalName,
      modelNumber: row.modelNumber,
      vendorProductUrl: row.vendorProductUrl,
    }));
  return { items, total };
}

/** El sync de Xtrabone guarda el material number en internalSku y el modelo en originalName. */
function guessModel(candidate: Candidate): string | undefined {
  const fromModel = candidate.modelNumber?.trim();
  if (fromModel && !/^\d+$/.test(fromModel)) return fromModel;
  const fromOriginal = candidate.originalName?.trim();
  if (fromOriginal && !/^\d+$/.test(fromOriginal)) return fromOriginal.split(/\s+/)[0];
  return undefined;
}

async function enrichOne(candidate: Candidate): Promise<NormalizedProduct> {
  try {
    const enrichment = await enrichCrestronProduct({
      materialNumber: candidate.internalSku,
      model: guessModel(candidate),
      knownUrl: candidate.vendorProductUrl ?? undefined,
    });
    return toNormalizedProduct(candidate, enrichment);
  } catch (error) {
    return toFailedNormalizedProduct(candidate, {
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      materialNumber: candidate.internalSku,
      model: guessModel(candidate),
    });
  }
}

/**
 * Si TODO el lote falló con 403, crestron.com nos está bloqueando: cortamos la
 * corrida con error en vez de guardar el fallo en cada producto.
 */
function assertNotBlocked(items: NormalizedProduct[]): void {
  if (items.length === 0) return;
  const blocked = items.filter((item) => {
    const raw = item.raw as { error?: unknown } | null;
    return typeof raw?.error === "string" && /HTTP 403/.test(raw.error);
  });
  if (blocked.length === items.length) {
    throw new Error(
      "crestron.com rechazó todas las peticiones del lote (HTTP 403). Esperá unos minutos y volvé a correr; " +
        "si persiste, configurá CRESTRON_HTTP_PROXY."
    );
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_PRODUCTS_MS));
    }
  });
  await Promise.all(runners);
  return results;
}

export const crestronWebConnector: ProductSourceConnector = {
  slug: "crestron-web",
  displayName: "Crestron.com (enriquecimiento)",
  source: "CRESTRON_WEB",
  matchField: "internalSku",

  async translateItems(items) {
    const shorts: string[] = [];
    const htmls: string[] = [];
    for (const item of items) {
      if (item.shortDescription) shorts.push(item.shortDescription);
      if (item.htmlContent) htmls.push(item.htmlContent);
    }
    if (shorts.length === 0 && htmls.length === 0) return;

    const [shortMap, htmlMap] = await Promise.all([
      translateBatchCached(shorts, "short_desc", TRANSLATION_DOMAIN),
      translateBatchCached(htmls, "long_desc", TRANSLATION_DOMAIN),
    ]);

    for (const item of items) {
      if (item.shortDescription) {
        item.shortDescription = shortMap.get(item.shortDescription) ?? item.shortDescription;
      }
      if (item.htmlContent) {
        const translated = htmlMap.get(item.htmlContent);
        if (translated && translated !== item.htmlContent) {
          item.htmlContent = translated;
          item.longDescription = translated
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
      }
    }
  },

  async fetchNormalized(opts) {
    const offset = Math.max(0, opts?.offset ?? 0);
    const batchSize = Math.max(1, Math.min(50, opts?.batchSize ?? 10));
    const { items: candidates, total } = await loadCandidates(offset, batchSize);
    const items = await mapWithConcurrency(candidates, CONCURRENCY, enrichOne);
    assertNotBlocked(items);
    const consumed = offset + candidates.length;
    const done = candidates.length === 0 || consumed >= total;
    return {
      items,
      total,
      done,
      nextOffset: done ? null : consumed,
      brandCounts: { CRESTRON: total },
    };
  },
};
