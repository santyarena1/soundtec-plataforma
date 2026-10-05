/**
 * Mapea un producto del catálogo de hallresearch.com al NormalizedProduct del pipeline.
 * Funciones puras. Regla de oro: undefined = no tocar. Nunca escribe precio, costo,
 * stock, marca, categoría ni isActive (eso es dominio de la lista de precios).
 */

import type { NormalizedImage, NormalizedProduct } from "@/services/sync/types";
import { HALL_RESEARCH_PRODUCT_PAGE } from "./catalog";
import type { HallResearchProduct, RichText, RichTextBlock, RichTextSpan } from "./types";

export const HALL_RESEARCH_WEB_RAW_KEY = "hallResearchWeb";
export const HALL_RESEARCH_WEB_IMAGE_SOURCE = "hallresearch";
/** La importación de la lista de precios guarda la foto del Excel con esta fuente. */
export const HALL_RESEARCH_EXCEL_IMAGE_SOURCE = "hallresearch-excel";

export interface HallResearchTargetProduct {
  supplierSku: string;
}

export interface HallResearchFailureInfo {
  fetchedAt: string;
  notFound?: boolean;
  error?: string;
}

/** Nombres de marca de Prismic → nombre comercial. */
const BRAND_LABELS: Record<string, string> = {
  atlona: "Atlona",
  javelin: "Javelin",
  hall: "Hall Tech",
  "gain-audio": "Gain Audio",
  captivate: "Captivate",
};

const LIST_TYPES: Record<string, "ul" | "ol"> = { "list-item": "ul", "o-list-item": "ol" };
const HEADING_TAGS: Record<string, string> = {
  heading1: "h3",
  heading2: "h3",
  heading3: "h3",
  heading4: "h4",
  heading5: "h4",
  heading6: "h4",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blockText(block: RichTextBlock): string {
  return typeof block.text === "string" ? block.text : "";
}

function textBlocks(rt: RichText): RichTextBlock[] {
  return (rt ?? []).filter((block) => !!block && blockText(block).trim().length > 0);
}

function safeHref(span: RichTextSpan): string | undefined {
  const url = span.data?.url;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : undefined;
}

function wrapSegment(text: string, active: RichTextSpan[]): string {
  let html = escapeHtml(text);
  if (active.some((span) => span.type === "em")) html = `<em>${html}</em>`;
  if (active.some((span) => span.type === "strong")) html = `<strong>${html}</strong>`;
  const link = active.find((span) => span.type === "hyperlink" && safeHref(span));
  if (link) html = `<a href="${escapeHtml(safeHref(link)!)}" rel="noopener noreferrer">${html}</a>`;
  return html;
}

/** Texto de un bloque con sus spans (strong/em/hyperlink) aplicados y escapado. */
function inlineHtml(block: RichTextBlock): string {
  const text = blockText(block);
  const spans = (block.spans ?? []).filter(
    (span) => span && span.end > span.start && span.start < text.length
  );
  if (spans.length === 0) return escapeHtml(text);
  const cuts = new Set<number>([0, text.length]);
  for (const span of spans) {
    cuts.add(Math.max(0, span.start));
    cuts.add(Math.min(text.length, span.end));
  }
  const points = Array.from(cuts).sort((a, b) => a - b);
  let html = "";
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const active = spans.filter((span) => span.start <= from && span.end >= to);
    html += wrapSegment(text.slice(from, to), active);
  }
  return html;
}

/** RichText de Prismic → HTML simple (p, ul/ol, h3/h4, strong, em, a). Ignora bloques vacíos e imágenes. */
export function richTextToHtml(rt: RichText): string {
  const parts: string[] = [];
  let openList: "ul" | "ol" | null = null;
  const closeList = () => {
    if (openList) parts.push(`</${openList}>`);
    openList = null;
  };
  for (const block of textBlocks(rt)) {
    const listTag = LIST_TYPES[block.type];
    if (listTag) {
      if (openList !== listTag) {
        closeList();
        parts.push(`<${listTag}>`);
        openList = listTag;
      }
      parts.push(`<li>${inlineHtml(block)}</li>`);
      continue;
    }
    closeList();
    const heading = HEADING_TAGS[block.type];
    if (heading) parts.push(`<${heading}>${inlineHtml(block)}</${heading}>`);
    else if (block.type === "paragraph" || block.type === "preformatted") parts.push(`<p>${inlineHtml(block)}</p>`);
  }
  closeList();
  return parts.join("");
}

/** RichText → texto plano. Párrafos separados por línea en blanco, ítems de lista con "• ". */
export function richTextToPlain(rt: RichText): string {
  const lines: string[] = [];
  let previousWasList = false;
  for (const block of textBlocks(rt)) {
    if (block.type === "image" || block.type === "embed") continue;
    const text = blockText(block).trim();
    const isList = !!LIST_TYPES[block.type];
    if (lines.length > 0) lines.push(isList && previousWasList ? "\n" : "\n\n");
    lines.push(isList ? `• ${text}` : text);
    previousWasList = isList;
  }
  return lines.join("").trim();
}

function listItemTexts(rt: RichText): string[] {
  const blocks = textBlocks(rt);
  const items = blocks.filter((block) => LIST_TYPES[block.type]);
  // Algunas fichas cargan las características como párrafos sueltos.
  const source = items.length > 0 ? items : blocks.filter((block) => block.type === "paragraph");
  return source.map((block) => blockText(block).trim());
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function categoryPath(item: HallResearchProduct): string | undefined {
  const { brand, sub_brand: subBrand, category } = item.data;
  const brandKey = (brand ?? "").trim().toLowerCase();
  const parts = [
    brandKey ? BRAND_LABELS[brandKey] ?? titleCase(brandKey) : "",
    titleCase((subBrand ?? "").trim()),
    titleCase((category ?? "").trim()),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" > ") : undefined;
}

function toImages(item: HallResearchProduct): NormalizedImage[] {
  const urls = (item.data.slideshow_images ?? [])
    .map((entry) => ({ url: entry?.image?.url?.trim() ?? "", alt: entry?.image?.alt ?? undefined }))
    .filter((entry) => /^https?:\/\//i.test(entry.url));
  const seen = new Set<string>();
  return urls
    .filter((entry) => (seen.has(entry.url) ? false : (seen.add(entry.url), true)))
    .map((entry, index) => ({
      url: entry.url,
      alt: entry.alt || undefined,
      isPrimary: index === 0,
      source: HALL_RESEARCH_WEB_IMAGE_SOURCE,
    }));
}

function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function toNormalizedProduct(
  target: HallResearchTargetProduct,
  item: HallResearchProduct,
  fetchedAt: string = new Date().toISOString()
): NormalizedProduct {
  const { data } = item;
  const title = richTextToPlain(data.header);
  const bodies = [data.overview_paragraph_full, data.details_body];
  const html = bodies.map((rt) => richTextToHtml(rt)).filter(Boolean).join("\n");
  const plain = bodies.map((rt) => richTextToPlain(rt)).filter(Boolean).join("\n\n");
  const keyFeatures = listItemTexts(data.features_body);
  const images = toImages(item);
  const tags = (item.tags ?? []).map((tag) => tag.trim()).filter(Boolean);

  return {
    matchField: "supplierSku",
    matchValue: target.supplierSku,
    name: target.supplierSku,
    preserveName: true,
    shortDescription: nonEmpty(richTextToPlain(data.header_description2)) ?? nonEmpty(title),
    htmlContent: nonEmpty(html),
    longDescription: nonEmpty(plain),
    keyFeatures: keyFeatures.length > 0 ? keyFeatures : undefined,
    images: images.length > 0 ? images : undefined,
    dropImageSources: images.length > 0 ? [HALL_RESEARCH_EXCEL_IMAGE_SOURCE] : undefined,
    vendorProductUrl: `${HALL_RESEARCH_PRODUCT_PAGE}${encodeURIComponent(item.uid)}`,
    sourceCategoryPath: categoryPath(item),
    metaKeywords: tags.length > 0 ? tags.join(", ") : undefined,
    rawKey: HALL_RESEARCH_WEB_RAW_KEY,
    raw: {
      uid: item.uid,
      title: title || null,
      brand: data.brand ?? null,
      sub_brand: data.sub_brand ?? null,
      category: data.category ?? null,
      tags,
      fetchedAt,
    },
  };
}

/** SKU sin ficha oficial (o error): solo deja constancia en sourceMetadata, no pisa nada más. */
export function toFailedNormalizedProduct(
  target: HallResearchTargetProduct,
  info: HallResearchFailureInfo
): NormalizedProduct {
  return {
    matchField: "supplierSku",
    matchValue: target.supplierSku,
    name: target.supplierSku,
    preserveName: true,
    rawKey: HALL_RESEARCH_WEB_RAW_KEY,
    raw: info,
  };
}
