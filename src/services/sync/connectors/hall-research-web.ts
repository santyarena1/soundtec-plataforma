/**
 * Conector de enriquecimiento desde hallresearch.com (Atlona, Javelin, Hall Tech,
 * Gain Audio, Captivate).
 *
 * Recorre los productos ya existentes de esas marcas (creados por la lista de
 * precios), los cruza por supplierSku contra el catálogo oficial (un único JSON)
 * y trae descripciones, características, galería de imágenes y URL de la ficha.
 * NO escribe precio, costo, stock, marca, categoría ni isActive.
 */

import { prisma } from "@/lib/prisma";
import { HALL_RESEARCH_BRANDS } from "@/services/hall-research/brands";
import { fetchHallResearchCatalog, indexCatalog, normalizeSku } from "@/services/hall-research-web/catalog";
import { toFailedNormalizedProduct, toNormalizedProduct } from "@/services/hall-research-web/normalize";
import type { HallResearchProduct } from "@/services/hall-research-web/types";
import type { NormalizedProduct, ProductSourceConnector } from "../types";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const CATALOG_TTL_MS = 10 * 60 * 1000;

let catalogCache: { at: number; index: Map<string, HallResearchProduct> } | null = null;
let catalogInFlight: Promise<Map<string, HallResearchProduct>> | null = null;

/** Baja el catálogo como mucho una vez cada CATALOG_TTL_MS (las corridas van por lotes). */
async function getCatalogIndex(): Promise<Map<string, HallResearchProduct>> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.index;
  if (!catalogInFlight) {
    catalogInFlight = fetchHallResearchCatalog()
      .then((results) => {
        const index = indexCatalog(results);
        catalogCache = { at: Date.now(), index };
        return index;
      })
      .finally(() => {
        catalogInFlight = null;
      });
  }
  return catalogInFlight;
}

function brandFilter(name: string) {
  return { name: { equals: name, mode: "insensitive" as const } };
}

function hallResearchWhere() {
  return {
    supplierSku: { not: null },
    brand: { OR: HALL_RESEARCH_BRANDS.map(brandFilter) },
  };
}

async function loadCandidates(offset: number, take: number) {
  const [total, rows] = await Promise.all([
    prisma.product.count({ where: hallResearchWhere() }),
    prisma.product.findMany({
      where: hallResearchWhere(),
      orderBy: { supplierSku: "asc" },
      skip: offset,
      take,
      select: { supplierSku: true },
    }),
  ]);
  return { rows, total };
}

async function countByBrand(): Promise<Record<string, number>> {
  const counts = await Promise.all(
    HALL_RESEARCH_BRANDS.map((name) =>
      prisma.product.count({ where: { supplierSku: { not: null }, brand: brandFilter(name) } })
    )
  );
  return Object.fromEntries(HALL_RESEARCH_BRANDS.map((name, i) => [name, counts[i]]));
}

function enrichOne(supplierSku: string, index: Map<string, HallResearchProduct>, fetchedAt: string): NormalizedProduct {
  const target = { supplierSku };
  const item = index.get(normalizeSku(supplierSku));
  return item
    ? toNormalizedProduct(target, item, fetchedAt)
    : toFailedNormalizedProduct(target, { notFound: true, fetchedAt });
}

export const hallResearchWebConnector: ProductSourceConnector = {
  slug: "hall-research-web",
  displayName: "Hall Research (enriquecimiento)",
  source: "HALL_RESEARCH_WEB",
  matchField: "supplierSku",

  async fetchNormalized(opts) {
    const offset = Math.max(0, opts?.offset ?? 0);
    const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, opts?.batchSize ?? DEFAULT_BATCH_SIZE));
    const [{ rows, total }, index, brandCounts] = await Promise.all([
      loadCandidates(offset, batchSize),
      getCatalogIndex(),
      offset === 0 ? countByBrand() : Promise.resolve(undefined),
    ]);
    const fetchedAt = new Date().toISOString();
    // El upsert busca por matchValue recortado: un supplierSku con espacios de más
    // no matchearía y crearía un duplicado, así que esos se saltean.
    const items = rows
      .map((row) => row.supplierSku)
      .filter((sku): sku is string => !!sku && sku.trim() === sku && sku.length > 0)
      .map((sku) => enrichOne(sku, index, fetchedAt));
    const consumed = offset + rows.length;
    const done = rows.length === 0 || consumed >= total;
    return {
      items,
      total,
      done,
      nextOffset: done ? null : consumed,
      brandCounts,
    };
  },
};
