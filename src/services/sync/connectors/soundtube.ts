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
import type { NormalizedProduct, ProductSourceConnector } from "../types";

export const SOUNDTUBE_SETTING_KEYS = {
  priceField: "soundtube.price_field",
  categoryTarget: "soundtube.category_target",
  translations: "soundtube.category_translations",
} as const;

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
    const [priceField, category, page] = await Promise.all([
      loadPriceField(),
      loadCategoryConfig(),
      fetchSoundTubePage(offset, batchSize),
    ]);
    const items = page.items
      .filter((item) => item.itemid?.trim())
      .map((item) => toNormalizedProduct(item, priceField, category));

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
