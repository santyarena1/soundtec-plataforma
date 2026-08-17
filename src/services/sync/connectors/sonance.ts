import {
  buildSkuToIdMap,
  fetchFromPortal,
  fetchProductDetailRaw,
  openSession,
  type PortalAccessory,
  type PortalAttributeType,
  type PortalDocument,
  type PortalProductDetail,
} from "@/services/sonance-portal";
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

type ListingProduct = Awaited<ReturnType<typeof fetchFromPortal>>["products"][number];

function normalizeDetail(
  listing: ListingProduct,
  detail: PortalProductDetail
): NormalizedProduct {
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
    matchValue: listing.supplierSku,
    name: detail.productTitle?.trim() || listing.name,
    baseCostUsd:
      basicListPrice !== undefined && basicListPrice > 0
        ? basicListPrice
        : listing.price > 0
          ? listing.price
          : undefined,
    modelNumber: detail.modelNumber?.trim() || undefined,
    manufacturerItem: detail.manufacturerItem?.trim() || undefined,
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
    brandName: detail.brand?.name?.trim() || listing.brand || undefined,
    categoryName: listing.category?.trim() || undefined,
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

  async fetchNormalized(opts) {
    const offset = Math.max(0, opts?.offset ?? 0);
    const batchSize = Math.max(1, Math.min(50, opts?.batchSize ?? 25));
    const listing = await fetchFromPortal();
    const total = listing.products.length;
    const batch = listing.products.slice(offset, offset + batchSize);
    const session = await openSession();
    const skuToPortalId = await buildSkuToIdMap(session);
    const items: NormalizedProduct[] = [];
    const concurrency = 4;

    for (let index = 0; index < batch.length; index += concurrency) {
      const chunk = batch.slice(index, index + concurrency);
      const details = await Promise.all(
        chunk.map(async (product) => {
          const portalId = skuToPortalId.get(product.supplierSku);
          if (!portalId) return undefined;
          const detail = await fetchProductDetailRaw(session, portalId);
          return detail ? normalizeDetail(product, detail) : undefined;
        })
      );
      items.push(
        ...details.filter((item): item is NormalizedProduct => item !== undefined)
      );
    }

    const consumed = offset + batch.length;
    const done = consumed >= total;
    return {
      items,
      total,
      done,
      nextOffset: done ? null : consumed,
      brandCounts: listing.brandCounts,
    };
  },
};
