import type { StockStatus } from "@prisma/client";

export interface NormalizedImage {
  url: string;
  alt?: string;
  isPrimary?: boolean;
  source?: string;
}

export interface NormalizedSpec {
  label: string;
  value: string;
  labelEs?: string;
  valueEs?: string;
  group?: string;
}

export interface NormalizedDoc {
  name: string;
  nameEs?: string;
  url: string;
  type?: string;
  fileType?: string;
}

export interface NormalizedProduct {
  matchField: "internalSku" | "supplierSku";
  matchValue: string;
  name: string;
  normalizedNameOverride?: string;
  baseCostUsd?: number;
  currency?: string;
  discountPercent?: number;
  stockStatus?: StockStatus;
  stockQuantity?: number;
  availabilityType?: string;
  availabilityMessage?: string;
  shortDescription?: string;
  longDescription?: string;
  htmlContent?: string;
  modelNumber?: string;
  manufacturerItem?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  salePriceUsd?: number;
  salePriceStartsAt?: Date;
  salePriceEndsAt?: Date;
  salePriceLabel?: string;
  requiresQuote?: boolean;
  badges?: Array<{ name?: string }>;
  weight?: number;
  volume?: number;
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
  urlSlug?: string;
  vendorProductUrl?: string;
  videoUrl?: string;
  originalName?: string;
  brandName?: string;
  categoryName?: string;
  familia?: string;
  tipo?: string;
  images?: NormalizedImage[];
  specifications?: NormalizedSpec[];
  documents?: NormalizedDoc[];
  accessorySkus?: string[];
  crossSellSkus?: string[];
  alsoPurchasedSkus?: string[];
  raw: unknown;
}

export interface ProductSourceConnector {
  slug: string;
  displayName: string;
  source: "CRESTRON" | "SONANCE" | "EXCEL" | "MANUAL";
  matchField: "internalSku" | "supplierSku";
  fetchNormalized(opts?: {
    offset?: number;
    batchSize?: number;
  }): Promise<{
    items: NormalizedProduct[];
    total: number;
    done: boolean;
    nextOffset: number | null;
    brandCounts?: Record<string, number>;
  }>;
}

export interface SyncDiffRow {
  matchValue: string;
  name: string;
  action: "create" | "update" | "noop";
  matched: boolean;
  productId: string | null;
  priceChanged: boolean;
  stockChanged: boolean;
  changedFields: string[];
}

export interface SyncPreview {
  total: number;
  matched: number;
  created: number;
  updated: number;
  priceChanges: number;
  stockChanges: number;
  rows: SyncDiffRow[];
}
