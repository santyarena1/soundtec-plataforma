/**
 * Mapea un item de soundtube.com al NormalizedProduct del pipeline.
 * Regla de oro: undefined = no tocar.
 */

import type { StockStatus } from "@prisma/client";
import type {
  NormalizedDoc,
  NormalizedImage,
  NormalizedProduct,
  NormalizedSpec,
} from "@/services/sync/types";
import { soundTubeDocumentUrl, soundTubeProductUrl, type SoundTubeItem } from "./client";

export const SOUNDTUBE_RAW_KEY = "soundtube";
export const SOUNDTUBE_IMAGE_SOURCE = "soundtube";
export const SOUNDTUBE_DEFAULT_BRAND = "SoundTube";

/** Nivel de precio que se usa como costo FOB (configurable en Sincronización). */
export type SoundTubePriceField = "pricelevel1" | "pricelevel30" | "onlinecustomerprice";
export const SOUNDTUBE_PRICE_FIELDS: Array<{ value: SoundTubePriceField; label: string }> = [
  { value: "pricelevel1", label: "Nivel 1 (precio dealer / más bajo)" },
  { value: "pricelevel30", label: "Nivel 30 (lista / MSRP)" },
  { value: "onlinecustomerprice", label: "Precio online (el que muestra el sitio)" },
];

const LOW_STOCK_THRESHOLD = 3;
const LB_TO_KG = 0.45359237;

const SPEC_FIELDS: Array<{ key: keyof SoundTubeItem; label: string; labelEs: string; group: string }> = [
  { key: "custitem_color", label: "Color", labelEs: "Color", group: "General" },
  { key: "custitem_enclosure_prop", label: "Enclosure", labelEs: "Gabinete", group: "Construcción" },
  { key: "custitem_grille_properties", label: "Grille", labelEs: "Rejilla", group: "Construcción" },
  { key: "custitem_input_power", label: "Input power", labelEs: "Potencia de entrada", group: "Eléctrico" },
  { key: "custitem_input_type", label: "Input type", labelEs: "Tipo de entrada", group: "Eléctrico" },
  { key: "custitem_ip_rating", label: "IP rating", labelEs: "Grado IP", group: "Ambiente" },
  { key: "custitem_en54", label: "EN 54", labelEs: "EN 54", group: "Certificaciones" },
  { key: "custitem_taa_compliant", label: "TAA compliant", labelEs: "Cumple TAA", group: "Certificaciones" },
  { key: "custitem_baa_compliant", label: "BAA compliant", labelEs: "Cumple BAA", group: "Certificaciones" },
  { key: "custitem_weight_kg", label: "Weight", labelEs: "Peso", group: "Dimensiones" },
  { key: "upccode", label: "UPC", labelEs: "UPC", group: "Identificación" },
  { key: "itemtype", label: "Item type", labelEs: "Tipo de ítem", group: "Identificación" },
];

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return clean && clean !== "-" ? clean : undefined;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Los nombres del sitio traen basura de NetSuite: prefijo "(Marca) ", tokens
 * "{}B" / "{J}" y un sufijo " MPN XXX" con el part number del fabricante.
 */
export function cleanDisplayName(raw: string): { name: string; mpn?: string } {
  let mpn: string | undefined;
  const name = raw
    .replace(/^\([^)]{2,40}\)\s*/, "")
    .replace(/\s*\{[A-Z]?\}[A-Z]?(?=\s|$)/g, " ")
    .replace(/\s+MPN\s+(\S+)\s*$/i, (_m, value: string) => {
      mpn = value;
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { name: name || raw.trim(), mpn };
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isDiscontinued(item: SoundTubeItem): boolean {
  return /discontinued/i.test(item.storedetaileddescription ?? "") || /discontinued/i.test(item.storedescription ?? "");
}

export function toStockStatus(item: SoundTubeItem): StockStatus {
  const qty = finite(item.quantityavailable) ?? 0;
  if (item.isinstock && qty > LOW_STOCK_THRESHOLD) return "IN_STOCK";
  if (item.isinstock && qty > 0) return "LOW_STOCK";
  if (item.isbackorderable) return "ON_REQUEST";
  return "OUT_OF_STOCK";
}

function specs(item: SoundTubeItem): NormalizedSpec[] {
  const rows: NormalizedSpec[] = [];
  for (const field of SPEC_FIELDS) {
    const value = text(item[field.key]);
    if (!value) continue;
    rows.push({ label: field.label, labelEs: field.labelEs, value, group: field.group });
  }
  const weightLb = finite(item.weight);
  if (weightLb && item.weightunit === "lb" && !text(item.custitem_weight_kg)) {
    rows.push({ label: "Weight", labelEs: "Peso", value: `${weightLb} lb`, group: "Dimensiones" });
  }
  return rows;
}

function documents(item: SoundTubeItem): NormalizedDoc[] {
  const raw = text(item.custitem_ag_related_documents);
  if (!raw) return [];
  const seen = new Set<string>();
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name && !seen.has(name) && seen.add(name))
    .map((name) => {
      const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toUpperCase();
      const lower = name.toLowerCase();
      const type = /manual/.test(lower)
        ? "Manuales"
        : /tech sheet|spec/.test(lower)
          ? "Spec Sheets"
          : /revit|\.rfa|cad|dwg/.test(lower)
            ? "CAD / BIM"
            : /ease|gll/.test(lower)
              ? "Datos acústicos"
              : "Documentos";
      return { name, url: soundTubeDocumentUrl(name), type, fileType: ext || undefined };
    });
}

function images(item: SoundTubeItem): NormalizedImage[] {
  const urls = item.itemimages_detail?.urls ?? [];
  const seen = new Set<string>();
  return urls
    .filter((image) => image.url && !seen.has(image.url) && seen.add(image.url))
    .map((image, index) => ({
      url: image.url,
      alt: text(image.altimagetext) ?? item.displayname,
      isPrimary: index === 0,
      source: SOUNDTUBE_IMAGE_SOURCE,
    }));
}

function weightKg(item: SoundTubeItem): number | undefined {
  const fromCustom = text(item.custitem_weight_kg)?.match(/([\d.,]+)\s*kg/i);
  if (fromCustom) {
    const n = Number(fromCustom[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 1000) / 1000;
  }
  const lb = finite(item.weight);
  if (lb && lb > 0) return Math.round(lb * (item.weightunit === "lb" ? LB_TO_KG : 1) * 1000) / 1000;
  return undefined;
}

export function categoryNameOf(item: SoundTubeItem): string | undefined {
  const fromCommerce = item.commercecategory?.categories?.[0]?.name;
  return text(fromCommerce) ?? text(item.custitemmanufacturer_category);
}

export function brandNameOf(item: SoundTubeItem): string {
  return text(item.manufacturer) ?? SOUNDTUBE_DEFAULT_BRAND;
}

export interface SoundTubeCategoryConfig {
  target: "categoria" | "familia" | "rubro" | "subrubro";
  translations: Record<string, string>;
}

export function toNormalizedProduct(
  item: SoundTubeItem,
  priceField: SoundTubePriceField,
  category: SoundTubeCategoryConfig
): NormalizedProduct {
  const sku = item.itemid.trim();
  const cleaned = cleanDisplayName(text(item.displayname) ?? sku);
  const displayName = cleaned.name;
  const html = text(item.storedetaileddescription);
  const short = text(item.storedescription) ?? text(item.featureddescription);
  const price = finite(item[priceField]) ?? finite(item.onlinecustomerprice);
  const stockStatus = toStockStatus(item);
  const qty = finite(item.quantityavailable);
  const rawCategory = categoryNameOf(item);
  const esCategory = rawCategory ? (category.translations[rawCategory] ?? "").trim() : "";
  const discontinued = isDiscontinued(item);
  const docs = documents(item);
  const galleryImages = images(item);

  const normalized: NormalizedProduct = {
    matchField: "supplierSku",
    matchValue: sku,
    name: displayName,
    originalName: displayName,
    brandName: brandNameOf(item),
    baseCostUsd: price,
    currency: "USD",
    stockStatus,
    stockQuantity: qty !== undefined ? Math.trunc(qty) : undefined,
    availabilityType: stockStatus.replaceAll("_", ""),
    availabilityMessage:
      qty !== undefined
        ? `SoundTube: ${Math.trunc(qty)} disponibles${item.isbackorderable ? " · se puede pedir sin stock" : ""}`
        : undefined,
    requiresQuote: price === undefined ? true : undefined,
    shortDescription: short ?? (html ? htmlToText(html).split("\n")[0] : undefined),
    htmlContent: html,
    longDescription: html ? htmlToText(html) : undefined,
    metaTitle: text(item.pagetitle) ?? displayName,
    modelNumber: sku,
    manufacturerItem: cleaned.mpn ?? sku,
    urlSlug: text(item.urlcomponent),
    vendorProductUrl: soundTubeProductUrl(item),
    weight: weightKg(item),
    isDiscontinued: discontinued,
    sourceCategoryPath: rawCategory,
    specifications: specs(item),
    documents: docs.length > 0 ? docs : undefined,
    images: galleryImages.length > 0 ? galleryImages : undefined,
    dropImageSources: galleryImages.length > 0 ? ["serper", "scraper"] : undefined,
    badges: [
      ...(text(item.custitem_taa_compliant) === "Yes" ? [{ name: "TAA Compliant" }] : []),
      ...(text(item.custitem_baa_compliant) === "Yes" ? [{ name: "BAA Compliant" }] : []),
      ...(text(item.custitem_en54) === "Yes" ? [{ name: "EN 54" }] : []),
    ],
    rawKey: SOUNDTUBE_RAW_KEY,
    raw: item,
  };
  if (normalized.badges && normalized.badges.length === 0) normalized.badges = undefined;
  if (esCategory) {
    if (category.target === "categoria") normalized.categoryName = esCategory;
    else if (category.target === "familia") normalized.familyName = esCategory;
    else if (category.target === "rubro") normalized.familia = esCategory;
    else normalized.tipo = esCategory;
  }
  return normalized;
}
