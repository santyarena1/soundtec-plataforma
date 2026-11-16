import {
  fetchBrandListingWithIds,
  fetchFromPortalWithIds,
  fetchProductsBySearch,
  fetchProductDetailRawOrThrow,
  fetchRealtimePricingDetailed,
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
import { codeNameFor } from "@/lib/product-code-name";
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

/** La corrida solo-James guarda su listado aparte para no mezclarse con el sync completo. */
function runCacheKey(): string {
  return onlyJamesRun() ? `${RUN_CACHE_KEY}.james` : RUN_CACHE_KEY;
}
const RUN_CACHE_MAX_AGE_MS = 30 * 60_000;

/**
 * Cuenta de facturación de JAMES en my.sonance.com (ej. "5580105J"). El mismo
 * usuario tiene la cuenta habitual (sin J, la que queda al iniciar sesión) y la
 * de James: el catálogo y el My Price de James solo se ven en la de James.
 * Vacío = el sync no usa la cuenta James (comportamiento anterior).
 * SONANCE_JAMES_ACCOUNT (variable de entorno) tiene prioridad; es para scripts.
 */
const JAMES_ACCOUNT_SETTING = "sonance.james_account";
const JAMES_CATEGORY_SLUG = "pn-james";
const JAMES_BRAND = "JAMES";

async function jamesAccountNumber(): Promise<string> {
  return (process.env.SONANCE_JAMES_ACCOUNT ?? "").trim() || (await getSetting(JAMES_ACCOUNT_SETTING, "")).trim();
}

/** SONANCE_ONLY_BRAND=JAMES: la corrida trae solo James (importación puntual por script). */
function onlyJamesRun(): boolean {
  return (process.env.SONANCE_ONLY_BRAND ?? "").trim().toUpperCase() === JAMES_BRAND;
}

interface CacheEntry {
  listing: ListingProduct;
  portalId: string | null;
  /** Cuenta del portal donde se pide detalle y My Price (vacío = la habitual). */
  account?: string;
}

interface RunCache {
  savedAt: string;
  sessionCookies: Record<string, string>;
  /** Cookies de sesión por cuenta alternativa (ej. "5580105J"). */
  accountCookies?: Record<string, Record<string, string>>;
  entries: CacheEntry[];
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

/**
 * Productos JAMES desde la cuenta James: la categoría pn-james con marca JAMES
 * en el listado (los accesorios Sonance que la categoría también lista siguen
 * saliendo de la cuenta habitual). Pisan a los de la cuenta habitual por SKU.
 */
async function addJamesEntries(
  account: string,
  entriesBySku: Map<string, CacheEntry>,
  subBrandBySku: Record<string, string>
): Promise<{ cookies: Record<string, string>; count: number }> {
  const session = await openSession({ account });
  const listing = await fetchBrandListingWithIds(session, JAMES_CATEGORY_SLUG, JAMES_BRAND, {
    onlyListingBrand: JAMES_BRAND,
  });
  for (const { product, portalId } of listing) {
    subBrandBySku[product.supplierSku] = JAMES_BRAND;
    entriesBySku.set(product.supplierSku, { listing: product, portalId, account });
  }
  return { cookies: session.cookies, count: listing.length };
}

async function buildRunCache(): Promise<RunCache> {
  const jamesAccount = await jamesAccountNumber();
  const subBrandBySku: Record<string, string> = {};
  const entriesBySku = new Map<string, CacheEntry>();
  let session: Session | undefined;
  let brandCounts: Record<string, number> | undefined;

  if (onlyJamesRun()) {
    if (!jamesAccount) {
      throw new Error(`SONANCE_ONLY_BRAND=JAMES necesita la cuenta James (setting ${JAMES_ACCOUNT_SETTING} o SONANCE_JAMES_ACCOUNT).`);
    }
  } else {
    session = await openSession();
    const listing = await fetchFromPortalWithIds(session);
    for (const { product, portalId } of listing.products) {
      entriesBySku.set(product.supplierSku, { listing: product, portalId });
    }
    const blazeListings = await fetchProductsBySearch(session, "blaze");
    for (const blazeListing of blazeListings) {
      const mapped = mapBlazeSearchListing(blazeListing);
      if (!mapped) continue;
      subBrandBySku[mapped.supplierSku] = "BLAZE BY SONANCE";
      entriesBySku.set(mapped.supplierSku, {
        listing: mapped,
        portalId: blazeListing.id,
      });
    }
    brandCounts = listing.brandCounts;
  }

  const accountCookies: Record<string, Record<string, string>> = {};
  if (jamesAccount) {
    const james = await addJamesEntries(jamesAccount, entriesBySku, subBrandBySku);
    accountCookies[jamesAccount] = james.cookies;
    brandCounts = { ...(brandCounts ?? {}), [JAMES_BRAND]: james.count };
  }

  const entries = [...entriesBySku.values()];
  const cache: RunCache = {
    savedAt: new Date().toISOString(),
    // En una corrida solo-James no hay sesión habitual: se usa la de James.
    sessionCookies: session?.cookies ?? accountCookies[jamesAccount] ?? {},
    accountCookies,
    entries,
    total: entries.length,
    brandCounts,
    subBrandBySku,
  };
  await setSetting(runCacheKey(), JSON.stringify(cache));
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
  noMyPriceCount: number;
}> {
  const items: NormalizedProduct[] = [];
  const concurrency = 5;
  const attempted = entries.filter((entry) => !!entry.portalId).length;
  const skippedNoId = entries.length - attempted;
  let failedCount = 0;
  let noMyPriceCount = 0;
  let firstError: string | undefined;

  for (let index = 0; index < entries.length; index += concurrency) {
    const chunk = entries.slice(index, index + concurrency);
    const details = await Promise.all(
      chunk.map(async ({ listing, portalId }) => {
        if (!portalId) return undefined;
        try {
          // Precio My Price se pide en lote abajo (realtimepricing).
          const detail = await fetchProductDetailRawOrThrow(session, portalId, {
            includeRealtimePrice: false,
          });
          if (detail) return { listing, portalId, detail };
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
              const detail = await fetchProductDetailRawOrThrow(session, portalId, {
                includeRealtimePrice: false,
              });
              if (detail) return { listing, portalId, detail };
            } catch (retryError) {
              if (isAuthError(retryError)) throw retryError;
            }
          }
          failedCount++;
          return undefined;
        }
      })
    );
    const loaded = details.filter(
      (row): row is { listing: ListingProduct; portalId: string; detail: PortalProductDetail } =>
        !!row
    );
    const pricing = await fetchRealtimePricingDetailed(
      session,
      loaded.map((row) => ({ productId: row.portalId, unitOfMeasure: row.detail.unitOfMeasure }))
    );
    const priceMap = pricing.prices;
    if (pricing.failedIds.length > 0) {
      // Sin My Price el costo no se toca (nunca se cae a wholesale); se informa en la corrida.
      noMyPriceCount += pricing.failedIds.length;
      firstError ??= `Sonance no devolvió My Price para ${pricing.failedIds.length} producto(s)` +
        (pricing.firstError ? `: ${pricing.firstError}` : "");
    }
    for (const row of loaded) {
      const price = priceMap.get(row.portalId);
      if (price) {
        row.detail.pricing = { ...(row.detail.pricing ?? {}), ...price };
      }
      items.push(normalizeDetail(row.listing, row.detail, subBrandBySku));
    }
  }

  return { items, failedCount, firstError, attempted, skippedNoId, noMyPriceCount };
}

function normalizeDetail(
  listing: ListingProduct,
  detail: PortalProductDetail,
  subBrandBySku: Record<string, string>
): NormalizedProduct {
  const title = str(detail.productTitle) ?? listing.name;
  const supplierSku = listing.supplierSku;
  const modelNumber = str(detail.modelNumber);
  // Nombre = modelo del portal; el título descriptivo queda en originalName.
  const name = codeNameFor({ source: "sonance", modelNumber }) ?? title;
  const manufacturerItem = str(detail.manufacturerItem);
  const brandName =
    subBrandBySku[supplierSku] ??
    inferBrandFromKeywords([
      title,
      supplierSku,
      modelNumber,
      manufacturerItem,
    ]) ??
    canonicalizeSonanceBrand(str(detail.brand?.name) ?? str(listing.brand));
  const htmlContent = str(detail.htmlContent);
  const basicSalePrice = finiteNumber(detail.basicSalePrice);
  // Solo unitNetPrice (My Price). unitListPrice/basicListPrice = WHOLESALE.
  const myPrice = resolveSonanceMyPrice({ pricing: detail.pricing });
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
    originalName: title,
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
    const storedCache = parseRunCache(await getSetting(runCacheKey(), ""));
    const cache = offset === 0 || !cacheIsFresh(storedCache)
      ? await buildRunCache()
      : storedCache;
    const total = cache.total;
    const batch = cache.entries.slice(offset, offset + batchSize);
    const subBrandBySku = cache.subBrandBySku ?? {};

    // Cada producto se pide en la cuenta de donde salió (habitual o James):
    // el My Price depende de la cuenta.
    const groups = new Map<string, CacheEntry[]>();
    for (const entry of batch) {
      const account = entry.account ?? "";
      groups.set(account, [...(groups.get(account) ?? []), entry]);
    }
    const detailResult: Awaited<ReturnType<typeof fetchBatchDetails>> = {
      items: [], failedCount: 0, firstError: undefined, attempted: 0, skippedNoId: 0, noMyPriceCount: 0,
    };
    for (const [account, entries] of groups) {
      const cookies = account ? cache.accountCookies?.[account] : cache.sessionCookies;
      let session = cookies ? sessionFromCookies(cookies) : await openSession({ account });
      let result: Awaited<ReturnType<typeof fetchBatchDetails>>;
      try {
        result = await fetchBatchDetails(entries, session, subBrandBySku);
      } catch (error) {
        if (!isAuthError(error)) throw error;
        session = await openSession({ account });
        if (account) cache.accountCookies = { ...(cache.accountCookies ?? {}), [account]: session.cookies };
        else cache.sessionCookies = session.cookies;
        cache.savedAt = new Date().toISOString();
        await setSetting(runCacheKey(), JSON.stringify(cache));
        result = await fetchBatchDetails(entries, session, subBrandBySku);
      }
      detailResult.items.push(...result.items);
      detailResult.failedCount += result.failedCount;
      detailResult.firstError ??= result.firstError;
      detailResult.attempted += result.attempted;
      detailResult.skippedNoId += result.skippedNoId;
      detailResult.noMyPriceCount += result.noMyPriceCount;
    }

    const { items, attempted, firstError, noMyPriceCount } = detailResult;
    if (items.length > 0 && noMyPriceCount >= items.length) {
      throw new Error(
        `Sonance: ningún producto del lote trajo My Price (realtimepricing). No se tocan costos. ${firstError ?? ""}`.trim()
      );
    }
    if (noMyPriceCount > 0) {
      console.error(`[sonance-sync] ${noMyPriceCount} producto(s) sin My Price en el lote; su costo no se actualiza.`);
    }
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
