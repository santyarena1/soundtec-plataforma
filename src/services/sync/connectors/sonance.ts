import {
  fetchFromPortalWithIds,
  fetchProductsBySearch,
  fetchProductDetailRawOrThrow,
  openSession,
  resolveSonanceMyPrice,
  sessionFromCookies,
  type Session,
  type PortalAccessory,
  type PortalAttributeType,
  type PortalDocument,
  type PortalProductDetail,
  type PortalProductListing,
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

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function finiteNumber(value: string | number | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validDate(value: unknown): Date | undefined {
  const normalized = str(value);
  if (!normalized) return undefined;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeSpecs(attrs: PortalAttributeType[] | undefined): NormalizedSpec[] {
  if (!Array.isArray(attrs)) return [];
  const specs: NormalizedSpec[] = [];
  for (const attr of attrs) {
    const label = str(attr.label) ?? str(attr.name);
    const values = (attr.attributeValues ?? [])
      .map((value) => str(value.valueDisplay) ?? str(value.value))
      .filter((value): value is string => !!value);
    if (label && values.length > 0) {
      specs.push({ label, value: values.join(", ") });
    }
  }
  return specs;
}

function normalizeDocs(docs: PortalDocument[] | undefined): NormalizedDoc[] {
  if (!Array.isArray(docs)) return [];
  return docs.flatMap((doc) => {
    const url = str(doc.fileUrl) ?? str(doc.filePath);
    const name = str(doc.name);
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
  const main = str(detail.largeImagePath) ?? str(detail.mediumImagePath);
  if (main) {
    seen.add(main);
    images.push({
      url: main,
      alt: detail.altText,
      isPrimary: true,
      source: "supplier",
    });
  }
  for (const image of detail.productImages ?? []) {
    const url = str(image.largeImagePath) ?? str(image.mediumImagePath) ?? str(image.smallImagePath);
    if (!url || seen.has(url)) continue;
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
    .map((item) => str(item.productNumber))
    .filter((value): value is string => !!value);
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
  subBrandBySku?: Record<string, string>;
}

function listingAttribute(
  listing: PortalProductListing,
  ...names: string[]
): string | undefined {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const attribute of listing.attributeTypes ?? []) {
    const label = str(attribute.label) ?? str(attribute.name);
    if (!label || !wanted.has(label.toLowerCase())) continue;
    for (const value of attribute.attributeValues ?? []) {
      const normalized = str(value.valueDisplay) ?? str(value.value);
      if (normalized) return normalized;
    }
  }
  return undefined;
}

function mapBlazeSearchListing(
  listing: PortalProductListing
): ListingProduct | undefined {
  const supplierSku = str(listing.productNumber);
  const name = str(listing.productTitle);
  if (!supplierSku || !name) return undefined;
  const rawPrice = finiteNumber(listing.unitListPrice);
  return {
    name,
    supplierSku,
    price: rawPrice !== undefined && rawPrice > 0 ? rawPrice : 0,
    uom: str(listing.customerUnitOfMeasure) ?? "EA",
    brand: "BLAZE BY SONANCE",
    category: listingAttribute(
      listing,
      "Product Category",
      "Product Super Category"
    ) ?? "",
    subcategory: listingAttribute(listing, "Product Sub Category") ?? "",
  };
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
      typeof value.total !== "number" ||
      (value.subBrandBySku !== undefined &&
        (!value.subBrandBySku || typeof value.subBrandBySku !== "object" || Array.isArray(value.subBrandBySku)))
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
  const categoryEntries = listing.products.map(({ product, portalId }) => ({
    listing: product,
    portalId,
  }));
  const blazeListings = await fetchProductsBySearch(session, "blaze");
  const subBrandBySku: Record<string, string> = {};
  const entriesBySku = new Map(
    categoryEntries.map((entry) => [entry.listing.supplierSku, entry])
  );
  for (const blazeListing of blazeListings) {
    const mapped = mapBlazeSearchListing(blazeListing);
    if (!mapped) continue;
    subBrandBySku[mapped.supplierSku] = "BLAZE BY SONANCE";
    entriesBySku.set(mapped.supplierSku, {
      listing: mapped,
      portalId: blazeListing.id,
    });
  }
  const entries = [...entriesBySku.values()];
  const cache: RunCache = {
    savedAt: new Date().toISOString(),
    sessionCookies: session.cookies,
    entries,
    total: entries.length,
    brandCounts: listing.brandCounts,
    subBrandBySku,
  };
  await setSetting(RUN_CACHE_KEY, JSON.stringify(cache));
  return cache;
}

function isAuthError(error: unknown): boolean {
  return error instanceof Error && /my\.sonance\.com API (401|403)\b/.test(error.message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBatchDetails(
  entries: RunCache["entries"],
  session: Session,
  subBrandBySku: Record<string, string>
): Promise<{
  items: NormalizedProduct[];
  failedCount: number;
  firstError: string | undefined;
  attempted: number;
  skippedNoId: number;
}> {
  const items: NormalizedProduct[] = [];
  const concurrency = 5;
  const attempted = entries.filter((entry) => !!entry.portalId).length;
  const skippedNoId = entries.length - attempted;
  let failedCount = 0;
  let firstError: string | undefined;

  for (let index = 0; index < entries.length; index += concurrency) {
    const chunk = entries.slice(index, index + concurrency);
    const details = await Promise.all(
      chunk.map(async ({ listing, portalId }) => {
        if (!portalId) return undefined;
        try {
          const detail = await fetchProductDetailRawOrThrow(session, portalId);
          if (detail) return normalizeDetail(listing, detail, subBrandBySku);
          const message = `Sonance devolvió un detalle vacío para ${portalId}`;
          firstError ??= message;
          failedCount++;
          return undefined;
        } catch (error) {
          if (isAuthError(error)) throw error;
          const message = errorMessage(error);
          firstError ??= message;
          if (/\b(429|503)\b/.test(message)) {
            await sleep(1200);
            try {
              const detail = await fetchProductDetailRawOrThrow(session, portalId);
              if (detail) return normalizeDetail(listing, detail, subBrandBySku);
            } catch (retryError) {
              if (isAuthError(retryError)) throw retryError;
            }
          }
          failedCount++;
          return undefined;
        }
      })
    );
    items.push(...details.filter((item): item is NormalizedProduct => item !== undefined));
  }

  return { items, failedCount, firstError, attempted, skippedNoId };
}

function normalizeDetail(
  listing: ListingProduct,
  detail: PortalProductDetail,
  subBrandBySku: Record<string, string>
): NormalizedProduct {
  const name = str(detail.productTitle) ?? listing.name;
  const supplierSku = listing.supplierSku;
  const modelNumber = str(detail.modelNumber);
  const manufacturerItem = str(detail.manufacturerItem);
  const brandName =
    subBrandBySku[supplierSku] ??
    inferBrandFromKeywords([
      name,
      supplierSku,
      modelNumber,
      manufacturerItem,
    ]) ??
    canonicalizeSonanceBrand(str(detail.brand?.name) ?? str(listing.brand));
  const htmlContent = str(detail.htmlContent);
  const basicListPrice = finiteNumber(detail.basicListPrice);
  const basicSalePrice = finiteNumber(detail.basicSalePrice);
  const myPrice = resolveSonanceMyPrice({
    pricing: detail.pricing,
    unitListPrice: detail.unitListPrice,
    listingPrice: listing.price,
    basicListPrice,
  });
  const weight = finiteNumber(detail.shippingWeight);
  const height = finiteNumber(detail.shippingHeight);
  const width = finiteNumber(detail.shippingWidth);
  const depth = finiteNumber(detail.shippingLength);
  const videoUrl = typeof detail.properties?.videoUrl === "string"
    ? detail.properties.videoUrl.trim() || undefined
    : undefined;
  const badges = detail.badges?.flatMap((badge) => {
    const badgeName = str(badge.name);
    return badgeName ? [{ name: badgeName }] : [];
  });

  return {
    matchField: "supplierSku",
    matchValue: supplierSku,
    name,
    // Costo FOB = My Price del dealer (unitNetPrice), no wholesale/basicListPrice.
    baseCostUsd: myPrice,
    modelNumber,
    manufacturerItem,
    metaTitle: str(detail.pageTitle),
    metaDescription: str(detail.metaDescription),
    metaKeywords: str(detail.metaKeywords),
    salePriceUsd:
      basicSalePrice !== undefined && basicSalePrice > 0
        ? basicSalePrice
        : undefined,
    salePriceStartsAt: validDate(detail.basicSaleStartDate),
    salePriceEndsAt: validDate(detail.basicSaleEndDate),
    salePriceLabel: str(detail.salePriceLabel),
    requiresQuote:
      listing.price <= 0
        ? true
        : typeof detail.quoteRequired === "boolean"
        ? detail.quoteRequired
        : undefined,
    availabilityMessage: str(detail.availability?.message),
    availabilityType: str(detail.availability?.messageType),
    badges: badges && badges.length > 0 ? badges : undefined,
    weight: weight !== undefined && weight > 0 ? weight : undefined,
    heightCm: height,
    widthCm: width,
    depthCm: depth,
    urlSlug: str(detail.urlSegment),
    vendorProductUrl:
      str(detail.productDetailUrl) ?? str(detail.canonicalUrl),
    videoUrl,
    originalName: str(detail.productTitle) ?? listing.name,
    brandName,
    categoryName: str(listing.category),
    tipo: str(listing.subcategory),
    shortDescription: str(detail.shortDescription),
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
    const allShorts: string[] = [];
    const allHtmls: string[] = [];

    for (const item of items) {
      if (item.shortDescription) allShorts.push(item.shortDescription);
      if (item.htmlContent) allHtmls.push(item.htmlContent);
    }

    const [shortDescs, htmlContents] = await Promise.all([
      translateBatchCached(allShorts, "short_desc"),
      translateBatchCached(allHtmls, "long_desc"),
    ]);

    for (const item of items) {
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
    }
  },

  async fetchNormalized(opts) {
    const offset = Math.max(0, opts?.offset ?? 0);
    const batchSize = Math.max(1, Math.min(100, opts?.batchSize ?? 25));
    const storedCache = parseRunCache(await getSetting(RUN_CACHE_KEY, ""));
    const cache = offset === 0 || !cacheIsFresh(storedCache)
      ? await buildRunCache()
      : storedCache;
    const total = cache.total;
    const batch = cache.entries.slice(offset, offset + batchSize);
    const subBrandBySku = cache.subBrandBySku ?? {};
    let session = sessionFromCookies(cache.sessionCookies);
    let detailResult: Awaited<ReturnType<typeof fetchBatchDetails>>;

    try {
      detailResult = await fetchBatchDetails(batch, session, subBrandBySku);
    } catch (error) {
      if (!isAuthError(error)) throw error;
      session = await openSession();
      cache.sessionCookies = session.cookies;
      cache.savedAt = new Date().toISOString();
      await setSetting(RUN_CACHE_KEY, JSON.stringify(cache));
      detailResult = await fetchBatchDetails(batch, session, subBrandBySku);
    }

    const { items, attempted, firstError } = detailResult;
    if (items.length === 0 && attempted > 0 && firstError) {
      throw new Error(
        `Sonance: fallaron los ${attempted} detalles del lote. Primer error: ${firstError}`
      );
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
