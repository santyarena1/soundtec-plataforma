/**
 * Carga de productos y armado del candidato que después ve el contexto.
 *
 * Vive separado del retrieval porque ahora hay dos caminos que traen
 * productos (facetas y texto) y ambos tienen que producir exactamente el
 * mismo objeto, con las mismas reglas de qué dato se copia y cuál no.
 */

import { Prisma } from "@prisma/client";
import type { AssistantScope, CandidateProduct, CandidateProfile, DocRow, SpecRow } from "./types";

export const PRODUCT_SELECT = {
  id: true,
  updatedAt: true,
  enrichedAt: true,
  internalSku: true,
  supplierSku: true,
  modelNumber: true,
  manufacturerItem: true,
  normalizedName: true,
  originalName: true,
  shortDescription: true,
  longDescription: true,
  htmlContent: true,
  keyFeatures: true,
  specifications: true,
  documents: true,
  sourceCategoryPath: true,
  isCrestronHomeCompatible: true,
  isDiscontinued: true,
  isCustomizable: true,
  weight: true,
  widthCm: true,
  heightCm: true,
  depthCm: true,
  baseCostUsd: true,
  stockStatus: true,
  stockQuantity: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
  family: { select: { name: true } },
  images: { select: { url: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 },
  accessories: {
    select: {
      kind: true,
      quantity: true,
      accessoryProduct: { select: { id: true, normalizedName: true, isActive: true } },
    },
    take: 24,
  },
  aiProfile: {
    select: {
      productType: true,
      environment: true,
      environmentEvidence: true,
      ipRating: true,
      mountTypes: true,
      audioLine: true,
      powerWatts: true,
      impedanceOhms: true,
      hdmiInputs: true,
      ecosystems: true,
      applications: true,
      summaryEs: true,
      builtAt: true,
    },
  },
} satisfies Prisma.ProductSelect;

export type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function parseSpecs(value: unknown): SpecRow[] {
  const out: SpecRow[] = [];
  for (const raw of asArray(value)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const label = text(row.labelEs) || text(row.label) || text(row.name);
    const val = text(row.valueEs) || text(row.value);
    if (!label || !val) continue;
    out.push({ label, value: val, group: text(row.group) || undefined });
  }
  return out;
}

export function parseDocs(value: unknown): DocRow[] {
  const out: DocRow[] = [];
  for (const raw of asArray(value)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const name = text(row.nameEs) || text(row.name);
    const url = text(row.url);
    if (!name || !url) continue;
    out.push({ name, url, type: text(row.type) || undefined });
  }
  return out;
}

export function parseFeatures(value: unknown): string[] {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item : text((item as Record<string, unknown>)?.text)))
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function htmlToText(html: string | null): string | null {
  if (!html) return null;
  const plain = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return plain || null;
}

function toNumber(value: Prisma.Decimal | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toProfile(row: ProductRow): CandidateProfile | null {
  const profile = row.aiProfile;
  if (!profile) return null;
  return {
    productType: profile.productType,
    environment: profile.environment,
    environmentEvidence: profile.environmentEvidence,
    ipRating: profile.ipRating,
    mountTypes: profile.mountTypes,
    audioLine: profile.audioLine,
    powerWatts: profile.powerWatts,
    impedanceOhms: profile.impedanceOhms,
    hdmiInputs: profile.hdmiInputs,
    ecosystems: profile.ecosystems,
    applications: profile.applications,
    summaryEs: profile.summaryEs,
  };
}

export function toCandidate(row: ProductRow, index: number, scope: AssistantScope): CandidateProduct {
  const relations = row.accessories
    .filter((rel) => rel.accessoryProduct?.isActive)
    .map((rel) => ({
      kind: rel.kind as string,
      name: rel.accessoryProduct.normalizedName,
      quantity: rel.quantity,
    }));

  const candidate: CandidateProduct = {
    id: row.id,
    label: `P${index + 1}`,
    name: row.normalizedName || row.originalName,
    brandName: row.brand?.name ?? null,
    categoryName: row.category?.name ?? null,
    familyName: row.family?.name ?? null,
    internalSku: row.internalSku,
    supplierSku: row.supplierSku,
    modelNumber: row.modelNumber,
    manufacturerItem: row.manufacturerItem,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    htmlText: htmlToText(row.htmlContent),
    keyFeatures: parseFeatures(row.keyFeatures),
    specifications: parseSpecs(row.specifications),
    documents: parseDocs(row.documents),
    relations,
    isCrestronHomeCompatible: row.isCrestronHomeCompatible,
    isDiscontinued: row.isDiscontinued,
    isCustomizable: row.isCustomizable,
    weightKg: toNumber(row.weight),
    dimensionsCm: {
      width: toNumber(row.widthCm),
      height: toNumber(row.heightCm),
      depth: toNumber(row.depthCm),
    },
    imageUrl: row.images[0]?.url ?? null,
    profile: toProfile(row),
    updatedAtMs: Math.max(
      row.updatedAt?.getTime() ?? 0,
      row.enrichedAt?.getTime() ?? 0,
      row.aiProfile?.builtAt?.getTime() ?? 0
    ),
  };

  // El costo y el stock solo existen para el scope admin: en público el dato
  // ni siquiera se copia al objeto que después arma el prompt.
  if (scope === "ADMIN") {
    candidate.admin = {
      baseCostUsd: toNumber(row.baseCostUsd),
      stockStatus: row.stockStatus,
      stockQuantity: row.stockQuantity,
    };
  }
  return candidate;
}

/** Texto del producto contra el que se cuentan los términos que matchean. */
export function haystackOf(row: ProductRow): string {
  return [
    row.normalizedName,
    row.originalName,
    row.brand?.name,
    row.category?.name,
    row.family?.name,
    row.shortDescription,
    row.sourceCategoryPath,
    row.aiProfile?.summaryEs,
    parseFeatures(row.keyFeatures).join(" "),
    parseSpecs(row.specifications)
      .map((spec) => `${spec.label} ${spec.value}`)
      .join(" "),
    (row.htmlContent ?? "").slice(0, 4000),
    (row.longDescription ?? "").slice(0, 1500),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
