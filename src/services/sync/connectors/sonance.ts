import {
  fetchFromPortalWithIds,
  fetchProductDetailRawOrThrow,
  openSession,
  sessionFromCookies,
  type Session,
  type PortalAccessory,
  type PortalAttributeType,
  type PortalDocument,
  type PortalProductDetail,
} from "@/services/sonance-portal";
import { getSetting, setSetting } from "@/lib/settings";
import { translateBatchCached } from "@/services/translation-cache";
import {
  canonicalizeSonanceBrand,
  inferBrandFromKeywords,
} from "../brand";
import type {
  NormalizedDoc,
  NormalizedImage,
  NormalizedProduct,
  NormalizedSpec,
  ProductSourceConnector,
} from "../types";

function finiteNumber(value: string | number | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validDate(value: string | null | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeSpecs(attrs: PortalAttributeType[] | undefined): NormalizedSpec[] {
  if (!Array.isArray(attrs)) return [];
  const specs: NormalizedSpec[] = [];
  for (const attr of attrs) {
    const label = (attr.label ?? attr.name ?? "").trim();
    const values = (attr.attributeValues ?? [])
      .map((value) => (value.valueDisplay ?? value.value ?? "").trim())
      .filter(Boolean);
    if (label && values.length > 0) {
      specs.push({ label, value: values.join(", ") });
    }
  }
  return specs;
}

function normalizeDocs(docs: PortalDocument[] | undefined): NormalizedDoc[] {
  if (!Array.isArray(docs)) return [];
  return docs.flatMap((doc) => {
    const url = (doc.fileUrl ?? doc.filePath ?? "").trim();
    const name = (doc.name ?? "").trim();
    return url && name
      ? [{
          name,
          url,
          type: doc.documentType,
          fileType: doc.fileTypeString,
        }]
      : [];
  });
}

function normalizeImages(detail: PortalProductDetail): NormalizedImage[] {
  const seen = new Set<string>();
  const images: NormalizedImage[] = [];
  const main = detail.largeImagePath ?? detail.mediumImagePath;
  if (main?.trim()) {
    seen.add(main);
    images.push({
      url: main,
      alt: detail.altText,
      isPrimary: true,
      source: "supplier",
    });
  }
  for (const image of detail.productImages ?? []) {
    const url = image.largeImagePath ?? image.mediumImagePath ?? image.smallImagePath;
    if (!url?.trim() || seen.has(url)) continue;
    seen.add(url);
    images.push({
      url,
      alt: image.imageAltText ?? image.name,
      isPrimary: false,
      source: "supplier",
    });
  }
  return images;
}

function pickSkus(items: PortalAccessory[] | undefined): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (item.productNumber ?? "").trim())
    .filter(Boolean);
}

type ListingProduct = Awaited<ReturnType<typeof fetchFromPortalWithIds>>["products"][number]["product"];

const RUN_CACHE_KEY = "sync.sonance.run_cache";
const RUN_CACHE_MAX_AGE_MS = 30 * 60_000;

interface RunCache {
  savedAt: string;
  sessionCookies: Record<string, string>;
  entries: Array<{ listing: ListingProduct; portalId: string | null }>;
  total: number;
  brandCounts?: Record<string, number>;
}

function parseRunCache(raw: string): RunCache | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<RunCache>;
    if (
      typeof value.savedAt !== "string" ||
      !value.sessionCookies ||
      typeof value.sessionCookies !== "object" ||
      !Array.isArray(value.entries) ||
      typeof value.total !== "number"
    ) {
      return undefined;
    }
    return value as RunCache;
  } catch {
    return undefined;
  }
}

function cacheIsFresh(cache: RunCache | undefined): cache is RunCache {
  if (!cache) return false;
  const savedAt = new Date(cache.savedAt).getTime();
  return Number.isFinite(savedAt) && Date.now() - savedAt < RUN_CACHE_MAX_AGE_MS;
}

async function buildRunCache(): Promise<RunCache> {
  const session = await openSession();
  const listing = await fetchFromPortalWithIds(session);
  const entries = listing.products.map(({ product, portalId }) => ({
    listing: product,
    portalId,
  }));
  const cache: RunCache = {
    savedAt: new Date().toISOString(),
    sessionCookies: session.cookies,
    entries,
    total: listing.total,
    brandCounts: listing.brandCounts,
  };
  await setSetting(RUN_CACHE_KEY, JSON.stringify(cache));
  return cache;
}

function isAuthError(error: unknown): boolean {
  return error instanceof Error && /my\.sonance\.com API (401|403)\b/.test(error.message);
}

async function fetchBatchDetails(
  entries: RunCache["entries"],
  session: Session
): Promise<NormalizedProduct[]> {
  const items: NormalizedProduct[] = [];
  const concurrency = 4;

  for (let index = 0; index < entries.length; index += concurrency) {
    const chunk = entries.slice(index, index + concurrency);
    const details = await Promise.all(
      chunk.map(async ({ listing, portalId }) => {
        if (!portalId) return undefined;
        try {
          const detail = await fetchProductDetailRawOrThrow(session, portalId);
          return detail ? normalizeDetail(listing, detail) : undefined;
        } catch (error) {
          if (isAuthError(error)) throw error;
          return undefined;
        }
      })
    );
    items.push(...details.filter((item): item is NormalizedProduct => item !== undefined));
  }

  return items;
}

function normalizeDetail(
  listing: ListingProduct,
  detail: PortalProductDetail
): NormalizedProduct {
  const name = detail.productTitle?.trim() || listing.name;
  const supplierSku = listing.supplierSku;
  const modelNumber = detail.modelNumber?.trim() || undefined;
  const manufacturerItem = detail.manufacturerItem?.trim() || undefined;
  const brandName =
    inferBrandFromKeywords([
      name,
      supplierSku,
      modelNumber,
      manufacturerItem,
    ]) ??
    canonicalizeSonanceBrand(detail.brand?.name || listing.brand);
  const htmlContent = detail.htmlContent?.trim() || undefined;
  const basicListPrice = finiteNumber(detail.basicListPrice);
  const basicSalePrice = finiteNumber(detail.basicSalePrice);
  const weight = finiteNumber(detail.shippingWeight);
  const height = finiteNumber(detail.shippingHeight);
  const width = finiteNumber(detail.shippingWidth);
  const depth = finiteNumber(detail.shippingLength);
  const videoUrl = typeof detail.properties?.videoUrl === "string"
    ? detail.properties.videoUrl.trim() || undefined
    : undefined;
  const badges = detail.badges
    ?.filter((badge) => badge.name?.trim())
    .map((badge) => ({ name: badge.name }));

  return {
    matchField: "supplierSku",
    matchValue: supplierSku,
    name,
    baseCostUsd:
      basicListPrice !== undefined && basicListPrice > 0
        ? basicListPrice
        : listing.price > 0
          ? listing.price
          : undefined,
    modelNumber,
    manufacturerItem,
    metaTitle: detail.pageTitle?.trim() || undefined,
    metaDescription: detail.metaDescription?.trim() || undefined,
    metaKeywords: detail.metaKeywords?.trim() || undefined,
    salePriceUsd:
      basicSalePrice !== undefined && basicSalePrice > 0
        ? basicSalePrice
        : undefined,
    salePriceStartsAt: validDate(detail.basicSaleStartDate),
    salePriceEndsAt: validDate(detail.basicSaleEndDate),
    salePriceLabel: detail.salePriceLabel?.trim() || undefined,
    requiresQuote:
      typeof detail.quoteRequired === "boolean"
        ? detail.quoteRequired
        : undefined,
    availabilityMessage: detail.availability?.message?.trim() || undefined,
    availabilityType: detail.availability?.messageType?.trim() || undefined,
    badges: badges && badges.length > 0 ? badges : undefined,
    weight: weight !== undefined && weight > 0 ? weight : undefined,
    heightCm: height,
    widthCm: width,
    depthCm: depth,
    urlSlug: detail.urlSegment?.trim() || undefined,
    vendorProductUrl:
      detail.productDetailUrl?.trim() ||
      detail.canonicalUrl?.trim() ||
      undefined,
    videoUrl,
    originalName: detail.productTitle?.trim() || listing.name,
    brandName,
    categoryName: listing.category?.trim() || undefined,
    tipo: listing.subcategory?.trim() || undefined,
    shortDescription: detail.shortDescription?.trim() || undefined,
    htmlContent,
    longDescription: htmlContent
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    images: normalizeImages(detail),
    specifications: normalizeSpecs(detail.attributeTypes),
    documents: normalizeDocs(detail.documents),
    accessorySkus: pickSkus(detail.accessories),
    crossSellSkus: pickSkus(detail.crossSells),
    alsoPurchasedSkus: pickSkus(detail.alsoPurchasedProducts),
    raw: detail,
  };
}

export const sonanceConnector: ProductSourceConnector = {
  slug: "sonance",
  displayName: "Sonance",
  source: "SONANCE",
  matchField: "supplierSku",

  async translateItems(items) {
    const allNames: string[] = [];
    const allShorts: string[] = [];
    const allHtmls: string[] = [];
    const allSpecLabels = new Set<string>();
    const allSpecValues = new Set<string>();
    const allDocNames = new Set<string>();

    for (const item of items) {
      if (item.name) allNames.push(item.name);
      if (item.shortDescription) allShorts.push(item.shortDescription);
      if (item.htmlContent) allHtmls.push(item.htmlContent);
      for (const spec of item.specifications ?? []) {
        allSpecLabels.add(spec.label);
        allSpecValues.add(spec.value);
      }
      for (const doc of item.documents ?? []) {
        allDocNames.add(doc.name);
      }
    }

    const [
      productNames,
      shortDescs,
      htmlContents,
      specLabels,
      specValues,
      docNames,
    ] = await Promise.all([
      translateBatchCached(allNames, "product_name"),
      translateBatchCached(allShorts, "short_desc"),
      translateBatchCached(allHtmls, "long_desc"),
      translateBatchCached(Array.from(allSpecLabels), "spec_label"),
      translateBatchCached(Array.from(allSpecValues), "spec_value"),
      translateBatchCached(Array.from(allDocNames), "doc_name"),
    ]);

    for (const item of items) {
      const translatedName = productNames.get(item.name);
      if (translatedName && translatedName !== item.name) {
        item.normalizedNameOverride = translatedName;
      }
      if (item.shortDescription) {
        item.shortDescription =
          shortDescs.get(item.shortDescription) ?? item.shortDescription;
      }
      if (item.htmlContent) {
        const translatedHtml =
          htmlContents.get(item.htmlContent) ?? item.htmlContent;
        item.htmlContent = translatedHtml;
        item.longDescription = translatedHtml
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      for (const spec of item.specifications ?? []) {
        spec.labelEs = specLabels.get(spec.label);
        spec.valueEs = specValues.get(spec.value);
      }
      for (const doc of item.documents ?? []) {
        doc.nameEs = docNames.get(doc.name);
      }
    }
  },

  async fetchNormalized(opts) {
    const offset = Math.max(0, opts?.offset ?? 0);
    const batchSize = Math.max(1, Math.min(50, opts?.batchSize ?? 25));
    const storedCache = parseRunCache(await getSetting(RUN_CACHE_KEY, ""));
    const cache = offset === 0 || !cacheIsFresh(storedCache)
      ? await buildRunCache()
      : storedCache;
    const total = cache.total;
    const batch = cache.entries.slice(offset, offset + batchSize);
    let session = sessionFromCookies(cache.sessionCookies);
    let items: NormalizedProduct[];

    try {
      items = await fetchBatchDetails(batch, session);
    } catch (error) {
      if (!isAuthError(error)) throw error;
      session = await openSession();
      cache.sessionCookies = session.cookies;
      cache.savedAt = new Date().toISOString();
      await setSetting(RUN_CACHE_KEY, JSON.stringify(cache));
      items = await fetchBatchDetails(batch, session);
    }

    const consumed = offset + batch.length;
    const done = consumed >= total;
    return {
      items,
      total,
      done,
      nextOffset: done ? null : consumed,
      brandCounts: cache.brandCounts,
    };
  },
};
