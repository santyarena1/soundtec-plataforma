import { QuoteAssetKind, QuoteNodeSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function catalogPrimaryImage(productId: string) {
  return prisma.productImage.findFirst({
    where: { productId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function ensureQuoteCatalogImage(input: {
  quoteId: string;
  productId: string;
  caption?: string;
}) {
  const existing = await prisma.quoteAsset.findFirst({
    where: { quoteId: input.quoteId, productId: input.productId, kind: QuoteAssetKind.PRODUCT },
  });
  if (existing) return existing;
  const img = await catalogPrimaryImage(input.productId);
  if (!img) return null;
  const sort = await prisma.quoteAsset.count({ where: { quoteId: input.quoteId } });
  return prisma.quoteAsset.create({
    data: {
      quoteId: input.quoteId,
      productId: input.productId,
      kind: QuoteAssetKind.PRODUCT,
      url: img.url,
      caption: input.caption || img.alt || "",
      aiGenerated: false,
      source: QuoteNodeSource.CATALOG_SEARCH,
      sortOrder: sort,
    },
  });
}

export async function fillMissingQuoteProductImages(quoteId: string) {
  const items = await prisma.quoteItem.findMany({
    where: { quoteId, productId: { not: null } },
    select: { productId: true, description: true },
  });
  for (const item of items) {
    if (!item.productId) continue;
    await ensureQuoteCatalogImage({
      quoteId,
      productId: item.productId,
      caption: item.description,
    });
  }
}

export async function upsertQuoteProductImage(input: {
  quoteId: string;
  productId: string;
  url: string;
  caption?: string;
  source: QuoteNodeSource;
}) {
  const existing = await prisma.quoteAsset.findFirst({
    where: { quoteId: input.quoteId, productId: input.productId, kind: QuoteAssetKind.PRODUCT },
  });
  if (existing) {
    if (existing.locked) return existing;
    return prisma.quoteAsset.update({
      where: { id: existing.id },
      data: {
        url: input.url,
        caption: input.caption ?? existing.caption,
        source: input.source,
        aiGenerated: false,
      },
    });
  }
  const sort = await prisma.quoteAsset.count({ where: { quoteId: input.quoteId } });
  return prisma.quoteAsset.create({
    data: {
      quoteId: input.quoteId,
      productId: input.productId,
      kind: QuoteAssetKind.PRODUCT,
      url: input.url,
      caption: input.caption || "",
      aiGenerated: false,
      source: input.source,
      sortOrder: sort,
    },
  });
}
