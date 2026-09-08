/**
 * Mapea el enriquecimiento de crestron.com al NormalizedProduct del pipeline.
 * Regla de oro: undefined = no tocar. Nunca escribe precio ni stock.
 */

import type {
  NormalizedDoc,
  NormalizedImage,
  NormalizedProduct,
  NormalizedSpec,
} from "@/services/sync/types";
import type { CrestronEnrichment, CrestronEnrichmentFailure, CrestronSpecRow } from "./types";

export const CRESTRON_WEB_RAW_KEY = "crestronCom";
export const CRESTRON_WEB_IMAGE_SOURCE = "crestron";

export interface CrestronTargetProduct {
  internalSku: string;
  normalizedName: string;
  originalName: string;
  modelNumber: string | null;
}

const INCH_TO_CM = 2.54;
const LB_TO_KG = 0.45359237;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** "1.74 in. (44 mm)" → 4.4 ; "17.03 in (433 mm)" → 43.3 */
export function parseLengthCm(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const mm = value.match(/([\d.,]+)\s*mm/i);
  if (mm) {
    const n = Number(mm[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round((n / 10) * 100) / 100;
  }
  const cm = value.match(/([\d.,]+)\s*cm\b/i);
  if (cm) {
    const n = Number(cm[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  const inch = value.match(/([\d.,]+)\s*(?:in\b|in\.|inch|")/i);
  if (inch) {
    const n = Number(inch[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * INCH_TO_CM * 100) / 100;
  }
  return undefined;
}

/** "3.9 lb (1.8 kg)" → 1.8 ; "12 oz (340 g)" → 0.34 */
export function parseWeightKg(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const kg = value.match(/([\d.,]+)\s*kg/i);
  if (kg) {
    const n = Number(kg[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 1000) / 1000;
  }
  const g = value.match(/([\d.,]+)\s*g\b/i);
  if (g) {
    const n = Number(g[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n) / 1000;
  }
  const lb = value.match(/([\d.,]+)\s*lbs?\b/i);
  if (lb) {
    const n = Number(lb[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * LB_TO_KG * 1000) / 1000;
  }
  return undefined;
}

function findSpec(specs: CrestronSpecRow[], group: RegExp, label: RegExp): string | undefined {
  return specs.find((row) => group.test(row.group) && label.test(row.label))?.value;
}

export function extractDimensions(specs: CrestronSpecRow[]): {
  heightCm?: number;
  widthCm?: number;
  depthCm?: number;
  weightKg?: number;
} {
  const dims = /dimension/i;
  return {
    heightCm: parseLengthCm(findSpec(specs, dims, /^height/i)),
    widthCm: parseLengthCm(findSpec(specs, dims, /^width/i)),
    depthCm: parseLengthCm(findSpec(specs, dims, /^depth/i)),
    weightKg: parseWeightKg(
      findSpec(specs, /weight/i, /./) ?? findSpec(specs, /./, /^weight/i)
    ),
  };
}

function buildHtmlContent(enrichment: CrestronEnrichment): string | undefined {
  const { page } = enrichment;
  const parts: string[] = [];
  if (page.overviewHtml) parts.push(page.overviewHtml);
  if (page.keyFeatures.length > 0) {
    parts.push(
      `<div class="key-features"><h3>Key Features</h3><ul>${page.keyFeatures
        .map((feature) => `<li>${escapeHtml(feature)}</li>`)
        .join("")}</ul></div>`
    );
  }
  if (page.footnotes.length > 0) {
    parts.push(
      `<div class="footnotes"><ol>${page.footnotes
        .map((note) => `<li>${escapeHtml(note)}</li>`)
        .join("")}</ol></div>`
    );
  }
  const html = parts.join("\n").trim();
  return html || undefined;
}

function buildLongDescription(enrichment: CrestronEnrichment): string | undefined {
  const { page } = enrichment;
  const sections: string[] = [];
  if (page.overviewText) sections.push(page.overviewText);
  if (page.keyFeatures.length > 0) {
    sections.push(["Key Features", ...page.keyFeatures.map((f) => `• ${f}`)].join("\n"));
  }
  if (page.footnotes.length > 0) {
    sections.push(page.footnotes.map((note, index) => `${index + 1}. ${note}`).join("\n"));
  }
  const text = sections.join("\n\n").trim();
  return text || undefined;
}

function toSpecs(rows: CrestronSpecRow[]): NormalizedSpec[] {
  return rows
    .filter((row) => row.value)
    .map((row) => ({ group: row.group, label: row.label, value: row.value }));
}

function toDocs(enrichment: CrestronEnrichment): NormalizedDoc[] {
  const docs: NormalizedDoc[] = enrichment.documents.map((doc) => ({
    name: doc.name,
    url: doc.url,
    type: doc.section,
    fileType: doc.format,
  }));
  for (const doc of enrichment.documents) {
    if (doc.htmlUrl) {
      docs.push({ name: `${doc.name} (HTML)`, url: doc.htmlUrl, type: doc.section, fileType: "HTML" });
    }
  }
  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (seen.has(doc.url)) return false;
    seen.add(doc.url);
    return true;
  });
}

function toImages(enrichment: CrestronEnrichment): NormalizedImage[] {
  return enrichment.page.images.map((image) => ({
    url: image.url,
    alt: image.title,
    isPrimary: image.isPrimary,
    source: CRESTRON_WEB_IMAGE_SOURCE,
  }));
}

function parseVendorDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function relationKeys(items: Array<{ model: string; materialNumber?: string }>): string[] {
  const keys: string[] = [];
  for (const item of items) {
    if (item.materialNumber) keys.push(item.materialNumber);
    if (item.model) keys.push(item.model);
  }
  return Array.from(new Set(keys));
}

export function toNormalizedProduct(
  target: CrestronTargetProduct,
  enrichment: CrestronEnrichment
): NormalizedProduct {
  const { page, search } = enrichment;
  const dims = extractDimensions(page.specs);
  const badges = page.badges.map((badge) => ({ name: badge.name }));
  const categoryPath = page.categoryPath.join(" > ");
  const primaryVideo = page.videoIds[0];

  return {
    matchField: "internalSku",
    matchValue: target.internalSku,
    name: target.normalizedName || page.model,
    preserveName: true,
    originalName: page.model,
    modelNumber: page.model || undefined,
    manufacturerItem: page.model || undefined,
    brandName: "CRESTRON",
    shortDescription: page.shortDescription ?? page.subtitle ?? undefined,
    htmlContent: buildHtmlContent(enrichment),
    longDescription: buildLongDescription(enrichment),
    metaTitle: page.subtitle ? `${page.model} — ${page.subtitle}` : page.metaTitle,
    metaDescription: page.metaDescription ?? page.shortDescription,
    metaKeywords: page.metaKeywords,
    specifications: toSpecs(page.specs),
    documents: toDocs(enrichment),
    images: toImages(enrichment),
    badges: badges.length > 0 ? badges : undefined,
    heightCm: dims.heightCm,
    widthCm: dims.widthCm,
    depthCm: dims.depthCm,
    weight: dims.weightKg,
    vendorProductUrl: page.url,
    urlSlug: page.url.split("/").filter(Boolean).pop(),
    videoUrl: primaryVideo ? `https://www.youtube.com/watch?v=${primaryVideo}` : undefined,
    isDiscontinued: page.isDiscontinued || search?.discontinued === true,
    regulatoryModel: page.regulatoryModel,
    keyFeatures: page.keyFeatures.length > 0 ? page.keyFeatures : undefined,
    sourceCategoryPath: categoryPath || undefined,
    vendorPublishedAt: parseVendorDate(search?.datePublished),
    accessorySkus: relationKeys(enrichment.accessories),
    includedItems: enrichment.inTheBox.map((item) => ({
      key: item.materialNumber ?? item.model,
      quantity: item.quantity,
    })),
    variantKeys: relationKeys(
      enrichment.variants.filter(
        (variant) =>
          variant.materialNumber !== target.internalSku &&
          variant.model.toUpperCase() !== page.model.toUpperCase()
      )
    ),
    relatedKeys: relationKeys([...enrichment.related, ...enrichment.interestedIn]),
    compatibleKeys: enrichment.compatibleModels ?? [],
    crossSellSkus: relationKeys(enrichment.replacements),
    rawKey: CRESTRON_WEB_RAW_KEY,
    raw: enrichment,
  };
}

export function toFailedNormalizedProduct(
  target: CrestronTargetProduct,
  failure: CrestronEnrichmentFailure
): NormalizedProduct {
  return {
    matchField: "internalSku",
    matchValue: target.internalSku,
    name: target.normalizedName || target.originalName || target.internalSku,
    preserveName: true,
    rawKey: CRESTRON_WEB_RAW_KEY,
    raw: failure,
  };
}
