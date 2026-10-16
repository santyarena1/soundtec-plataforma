/**
 * Conector SoundTube (soundtube.com — SoundTube, Soundsphere, Phase
 * Technology, dARTS, Rockustics, Induction Dynamics, SolidDrive).
 *
 * Fuente: API pública del sitio (sin login). Trae precio (nivel configurable),
 * stock, descripción, imágenes, documentos, atributos y categoría.
 */

import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import { translateBatchCached } from "@/services/translation-cache";
import { fetchSoundTubePage, SOUNDTUBE_PAGE_LIMIT } from "@/services/soundtube/client";
import {
  toNormalizedProduct,
  type SoundTubeCategoryConfig,
  type SoundTubePriceField,
} from "@/services/soundtube/normalize";
import { loadIdentityOverrides } from "@/services/soundtube/identity-overrides";
import type { NormalizedProduct, ProductSourceConnector } from "../types";

export const SOUNDTUBE_SETTING_KEYS = {
  priceField: "soundtube.price_field",
  categoryTarget: "soundtube.category_target",
  translations: "soundtube.category_translations",
  /** "excel" = el costo sale de la lista Excel (admin/sync/soundtube-prices); el sync no lo pisa. */
  priceSource: "soundtube.price_source",
  /** "excel" = rubro/subrubro/familia/tipo salen del Excel; el sync no los pisa. */
  taxonomySource: "soundtube.taxonomy_source",
} as const;

/** groupId de las reglas de MUP que crea la lista Excel (una por producto con precio). */
export const SOUNDTUBE_MUP_GROUP_ID = "soundtube-excel-mup";

interface ExcelOverrides {
  price: boolean;
  taxonomy: boolean;
}

async function loadExcelOverrides(): Promise<ExcelOverrides> {
  const [price, taxonomy] = await Promise.all([
    getSetting(SOUNDTUBE_SETTING_KEYS.priceSource, "api"),
    getSetting(SOUNDTUBE_SETTING_KEYS.taxonomySource, "api"),
  ]);
  return { price: price.trim() === "excel", taxonomy: taxonomy.trim() === "excel" };
}

/**
 * Precio y clasificación según la lista Excel. El precio del portal de
 * SoundTube nunca se usa:
 * - producto con precio de la lista (o cargado a mano en la revisión): el sync no toca el costo;
 * - producto que no está en la lista (nuevo o existente): queda sin precio (costo 0, "a consultar").
 * La clasificación del Excel, si se eligió, solo se respeta en productos que ya existen.
 */
export function withoutExcelFields(
  item: NormalizedProduct,
  excel: ExcelOverrides,
  existingSkus: ReadonlySet<string>,
  excelPricedSkus: ReadonlySet<string>
): NormalizedProduct {
  const priced = excelPricedSkus.has(item.matchValue);
  const price = priced ? { baseCostUsd: undefined, requiresQuote: undefined } : { baseCostUsd: 0, requiresQuote: true };
  const keepTaxonomy = excel.taxonomy && existingSkus.has(item.matchValue);
  return {
    ...item,
    ...price,
    ...(keepTaxonomy ? { categoryName: undefined, familyName: undefined, familia: undefined, tipo: undefined } : {}),
  };
}

const TRANSLATION_DOMAIN =
  "SoundTube / Soundsphere / Phase Technology / Rockustics — parlantes comerciales y residenciales B2B";

async function loadPriceField(): Promise<SoundTubePriceField> {
  const raw = (await getSetting(SOUNDTUBE_SETTING_KEYS.priceField, "pricelevel1")).trim();
  return raw === "pricelevel30" || raw === "onlinecustomerprice" ? raw : "pricelevel1";
}

async function loadCategoryConfig(): Promise<SoundTubeCategoryConfig> {
  const [targetRaw, translationsRaw] = await Promise.all([
    getSetting(SOUNDTUBE_SETTING_KEYS.categoryTarget, "categoria"),
    getSetting(SOUNDTUBE_SETTING_KEYS.translations, "{}"),
  ]);
  let translations: Record<string, string> = {};
  try {
    const parsed = JSON.parse(translationsRaw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) translations = parsed;
  } catch {
    translations = {};
  }
  const target = ["categoria", "familia", "rubro", "subrubro"].includes(targetRaw)
    ? (targetRaw as SoundTubeCategoryConfig["target"])
    : "categoria";
  return { target, translations };
}

/** Las categorías/familias destino se crean antes del upsert (igual que Crestron). */
async function ensureTaxonomy(names: string[], target: SoundTubeCategoryConfig["target"]): Promise<void> {
  if (target !== "categoria" && target !== "familia") return;
  for (const name of names) {
    const normalized = name.trim();
    if (!normalized) continue;
    if (target === "categoria") {
      const existing = await prisma.category.findFirst({
        where: { name: { equals: normalized, mode: "insensitive" } },
        select: { id: true },
      });
      if (!existing) await prisma.category.create({ data: { name: normalized, slug: slugify(normalized) } });
    } else {
      const existing = await prisma.productFamily.findFirst({
        where: { name: { equals: normalized, mode: "insensitive" } },
        select: { id: true },
      });
      if (!existing) await prisma.productFamily.create({ data: { name: normalized, slug: slugify(normalized) } });
    }
  }
}

export const soundtubeConnector: ProductSourceConnector = {
  slug: "soundtube",
  displayName: "SoundTube",
  source: "SOUNDTUBE",
  matchField: "supplierSku",

  async translateItems(items: NormalizedProduct[]) {
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
    const batchSize = Math.max(1, Math.min(SOUNDTUBE_PAGE_LIMIT, opts?.batchSize ?? 50));
    const [priceField, category, excel, page] = await Promise.all([
      loadPriceField(),
      loadCategoryConfig(),
      loadExcelOverrides(),
      fetchSoundTubePage(offset, batchSize),
    ]);
    const normalized = page.items
      .filter((item) => item.itemid?.trim())
      .map((item) => toNormalizedProduct(item, priceField, category));
    const existing = await prisma.product.findMany({
      where: { supplierSku: { in: normalized.map((item) => item.matchValue) } },
      select: { id: true, supplierSku: true },
    });
    const existingSkus = new Set(existing.flatMap((row) => (row.supplierSku ? [row.supplierSku] : [])));
    // Con precio de la lista = tiene la regla de MUP de la lista (o un precio cargado a mano en la revisión).
    const pricedIds = new Set(
      (
        await prisma.marginRule.findMany({
          where: { groupId: SOUNDTUBE_MUP_GROUP_ID, productId: { in: existing.map((row) => row.id) } },
          select: { productId: true },
        })
      ).flatMap((rule) => (rule.productId ? [rule.productId] : []))
    );
    const excelPricedSkus = new Set(existing.flatMap((row) => (row.supplierSku && pricedIds.has(row.id) ? [row.supplierSku] : [])));
    // Productos que muestran el SKU/descripción de la lista: el sync no los pisa.
    const identities = await loadIdentityOverrides();
    const identityBySku = new Map(
      existing.flatMap((row) => {
        const identity = identities.get(row.id);
        return row.supplierSku && identity ? [[row.supplierSku, identity] as const] : [];
      })
    );
    const items = normalized.map((item) => {
      const priced = withoutExcelFields(item, excel, existingSkus, excelPricedSkus);
      const identity = identityBySku.get(item.matchValue);
      return identity
        ? { ...priced, name: identity.name, originalName: identity.originalName, modelNumber: identity.modelNumber, preserveName: true }
        : priced;
    });

    const esNames = Array.from(
      new Set(items.flatMap((item) => [item.categoryName, item.familyName]).filter((n): n is string => !!n))
    );
    await ensureTaxonomy(esNames, category.target);

    const consumed = offset + page.items.length;
    const done = page.items.length === 0 || consumed >= page.total;
    const brandCounts: Record<string, number> = {};
    for (const item of items) brandCounts[item.brandName ?? "SoundTube"] = (brandCounts[item.brandName ?? "SoundTube"] ?? 0) + 1;
    return {
      items,
      total: page.total,
      done,
      nextOffset: done ? null : consumed,
      brandCounts,
    };
  },
};
