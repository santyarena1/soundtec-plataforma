/**
 * Parsers HTML de la ficha pública de crestron.com y de sus bloques dinámicos.
 * Sin efectos secundarios: reciben HTML y devuelven estructuras tipadas.
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { absoluteUrl } from "./client";
import type {
  CrestronBadge,
  CrestronDocument,
  CrestronImage,
  CrestronProductPage,
  CrestronRelatedItem,
  CrestronSpecRow,
} from "./types";

type CheerioRoot = ReturnType<typeof cheerio.load>;
type Selection = ReturnType<CheerioRoot>;

const LEGAL_PARAGRAPH_MARKERS = [
  "This product may be purchased from select authorized Crestron dealers",
  "This product is covered under the Crestron standard limited warranty",
  "The specific patents that cover Crestron products",
  "Certain Crestron products contain open source software",
  "are either trademarks or registered trademarks of Crestron Electronics",
];

export function cleanText(value: string | undefined | null): string {
  return (value ?? "")
    .replace(/ /g, " ")
    .replace(/[‑]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonAttr(value: string | undefined): Record<string, string> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, val]) => [key, String(val ?? "")])
    );
  } catch {
    return undefined;
  }
}

function absolutizeLinks($: CheerioRoot, root: Selection): void {
  root.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const abs = absoluteUrl(href);
    if (abs) $(el).attr("href", abs);
  });
  root.find("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    const abs = absoluteUrl(src);
    if (abs) $(el).attr("src", abs);
  });
}

function stripLegalParagraphs($: CheerioRoot, root: Selection): string | undefined {
  const legal: string[] = [];
  root.find("p").each((_, el) => {
    const text = cleanText($(el).text());
    if (LEGAL_PARAGRAPH_MARKERS.some((marker) => text.includes(marker))) {
      legal.push(text);
      $(el).remove();
    }
  });
  return legal.length > 0 ? legal.join("\n\n") : undefined;
}

function htmlToText(html: string): string {
  const $ = cheerio.load(`<div id="__root">${html}</div>`);
  const root = $("#__root");
  root.find("br").replaceWith("\n");
  root.find("p, li, h1, h2, h3, h4, h5, h6, div").each((_, el) => {
    $(el).append("\n");
  });
  return root
    .text()
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Tabla de specs. Crestron usa dos layouts:
 *  - 2 columnas: [Head colspan=2] / [Name, Value] / [Value colspan=2]
 *  - 3 columnas (fichas viejas): [Head colspan=3] / [vacío, Name, Value] /
 *    [vacío, Head colspan=2] (sub-grupo) / [vacío, Value colspan=2]
 * Se clasifica cada celda por su clase (productSpecTDHead / Name / Value).
 */
function parseSpecs($: CheerioRoot): CrestronSpecRow[] {
  const rows: CrestronSpecRow[] = [];
  let group = "General";
  let subGroup: string | null = null;
  let pendingLabel: string | null = null;

  $("#panel2 table tr").each((_, tr) => {
    const cells = $(tr).find("td").toArray();
    if (cells.length === 0) return;
    let head: string | null = null;
    let name: string | null = null;
    let value: string | null = null;
    let leadingEmpty = false;
    cells.forEach((cell, index) => {
      const className = $(cell).attr("class") ?? "";
      const text = cleanText($(cell).text());
      if (!text) {
        if (index === 0) leadingEmpty = true;
        return;
      }
      if (/productSpecTDHead/i.test(className)) head = text;
      else if (/productSpecTDName/i.test(className)) name = text;
      else if (/productSpecTDValue/i.test(className)) value = value ? `${value} ${text}` : text;
      else if (!name && cells.length >= 2 && index < cells.length - 1) name = text;
      else value = value ? `${value} ${text}` : text;
    });

    if (head) {
      if (leadingEmpty && cells.length >= 2) {
        subGroup = head;
      } else {
        group = head;
        subGroup = null;
      }
      pendingLabel = null;
      return;
    }
    const currentGroup = subGroup ? `${group} › ${subGroup}` : group;
    if (name && value) {
      rows.push({ group: currentGroup, label: name, value });
      pendingLabel = null;
      return;
    }
    if (name && !value) {
      pendingLabel = name;
      return;
    }
    if (value) {
      rows.push({ group: currentGroup, label: pendingLabel ?? subGroup ?? group, value });
      pendingLabel = null;
    }
  });
  return rows;
}

function parseImages($: CheerioRoot): CrestronImage[] {
  const images: CrestronImage[] = [];
  const seen = new Set<string>();
  $("#modelPageDisplay a[data-external]").each((_, el) => {
    const link = $(el);
    const assetId = cleanText(link.attr("data-external"));
    const name = cleanText(link.attr("data-name"));
    const href = link.attr("href") ?? "";
    if (!assetId || !href || seen.has(assetId)) return;
    seen.add(assetId);
    const ext = (link.attr("data-ext") ?? "").toLowerCase();
    const fileExt = ext === "jpg" || ext === "jpeg" ? "jpeg" : "png";
    const base = `https://embed.widencdn.net/img/crestron/${assetId}`;
    images.push({
      assetId,
      name,
      title: cleanText(link.attr("title")) || name,
      url: `${base}/2500px@1x/${name}.${fileExt}`,
      mediumUrl: `${base}/600x400px/${name}.${fileExt}`,
      thumbUrl: `${base}/140x140px/${name}.${fileExt}`,
      downloadUrl: link.attr("data-url") || undefined,
      ext: link.attr("data-ext") || undefined,
      sizeLabel: link.attr("data-size") || undefined,
      isPrimary: images.length === 0,
    });
  });
  return images;
}

function parseBadges($: CheerioRoot): CrestronBadge[] {
  const badges: CrestronBadge[] = [];
  const seen = new Set<string>();
  $("img.badge").each((_, el) => {
    const name = cleanText($(el).attr("alt"));
    if (!name || seen.has(name)) return;
    seen.add(name);
    badges.push({ name, imageUrl: absoluteUrl($(el).attr("src")) });
  });
  return badges;
}

function parseCategoryPath($: CheerioRoot): string[] {
  const parts: string[] = [];
  $(".CMSBreadCrumbsLink").each((_, el) => {
    const text = cleanText($(el).text());
    if (text && text !== "Products" && text !== "Catalog") parts.push(text);
  });
  return parts;
}

function parseVideoIds($: CheerioRoot, html: string): string[] {
  const ids = new Set<string>();
  $("[data-vid]").each((_, el) => {
    const id = cleanText($(el).attr("data-vid"));
    if (id) ids.add(id);
  });
  const re = /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) ids.add(match[1]);
  return Array.from(ids);
}

export function parseProductPage(html: string, url: string): CrestronProductPage {
  const $ = cheerio.load(html);

  const model = cleanText($(".model-name").first().text());
  const subtitle = cleanText($(".model-title").first().text());
  const materialMatch = cleanText($(".material-number").text()).match(/Material Number:\s*([A-Z0-9-]+)/i);
  const shortDescription = cleanText($(".model-short-description").text()) || undefined;

  const keyFeatures: string[] = [];
  $("#panel1 .overview_features li").each((_, el) => {
    const text = cleanText($(el).text());
    if (text) keyFeatures.push(text);
  });
  const footnotes: string[] = [];
  $("#panel1 .footnotes li, #panel2 .footnotes li").each((_, el) => {
    const text = cleanText($(el).text());
    if (text && !footnotes.includes(text)) footnotes.push(text);
  });

  const overviewColumn = $("#panel1 .column").first();
  overviewColumn.find(".overview_features, .footnotes, .in-the-box, script, style").remove();
  absolutizeLinks($, overviewColumn);
  const legalText = stripLegalParagraphs($, overviewColumn);
  const overviewHtml = (overviewColumn.html() ?? "").trim();
  const overviewText = htmlToText(overviewHtml);

  const specs = parseSpecs($);
  const regulatoryModel = specs
    .map((row) => row.value.match(/Regulatory Model:\s*([A-Z0-9-]+)/i)?.[1])
    .find((value): value is string => !!value);

  const supportLinks: Array<{ label: string; url: string }> = [];
  $("#panel1 .in-the-box a[href]").each((_, el) => {
    const label = cleanText($(el).text());
    const href = absoluteUrl($(el).attr("href"));
    if (label && href) supportLinks.push({ label, url: href });
  });

  const modelTabs = $("#model-tabs");
  const relatedObj = parseJsonAttr($("#dv-RelatedProducts").attr("data-productslider-obj"));

  return {
    url,
    model,
    subtitle,
    materialNumber: materialMatch?.[1],
    shortDescription,
    overviewHtml,
    overviewText,
    keyFeatures,
    footnotes,
    legalText,
    specs,
    regulatoryModel,
    images: parseImages($),
    badges: parseBadges($),
    categoryPath: parseCategoryPath($),
    isDiscontinued:
      /\/Inactive\/Discontinued\//i.test(url) ||
      /this product has been discontinued/i.test(cleanText($(".availability-wrapper").text())),
    documentId: cleanText(modelTabs.attr("data-did")) || undefined,
    nodeGuid: relatedObj?.NodeGUID,
    metaTitle: cleanText($("title").first().text()) || undefined,
    metaDescription: cleanText($('meta[name="description"]').attr("content")) || undefined,
    metaKeywords: cleanText($('meta[name="keywords"]').attr("content")) || undefined,
    videoIds: parseVideoIds($, html),
    supportLinks,
    handlers: {
      variantList: parseJsonAttr($("#dv-VariantList").attr("data-variantlist-obj")),
      variantDropdown: parseJsonAttr($("#dv-VariantDropDown").attr("data-variantdropdown-obj")),
      relatedProducts: relatedObj,
      interestedIn: parseJsonAttr($("#dv-InterestedIn").attr("data-productslider-obj")),
      optionalAccessoryIds: cleanText($("#optional-accessories").attr("data-ids")) || undefined,
      replacementIds: cleanText($("#replacement-products").attr("data-ids")) || undefined,
      replacementLabel: cleanText($("#replacement-products").attr("data-label")) || undefined,
    },
  };
}

/** Pestaña "Resources" (ResourceHandler.ashx). */
export function parseResources(html: string): CrestronDocument[] {
  const $ = cheerio.load(html);
  const docs: CrestronDocument[] = [];
  let section = "Resources";
  const walk = (node: AnyNode) => {
    const el = $(node);
    if (el.is("h4")) {
      section = cleanText(el.text()) || section;
      return;
    }
    if (el.is(".model-resource-info")) {
      const info = el.find("> div").first();
      const titleLink = info.find("a").first();
      const name = cleanText(titleLink.text());
      const detail = info.find("div").first();
      const detailHtml = detail.html() ?? "";
      const [kindRaw, ...descParts] = detailHtml.split(/<br\s*\/?>/i);
      const kind = cleanText(cheerio.load(kindRaw)("body").text()) || undefined;
      const description = cleanText(cheerio.load(descParts.join(" "))("body").text()) || undefined;
      const titleUrl = absoluteUrl(titleLink.attr("href")) ?? "";
      // Enlaces de acción: los que NO son el título (columnas "PDF/Download" y "HTML")
      const actionLinks = el
        .find("> div")
        .slice(1)
        .find("a[href]")
        .toArray()
        .map((a) => ({
          label: cleanText($(a).text()),
          url: absoluteUrl($(a).attr("href")) ?? "",
        }))
        .filter((link) => link.url);
      const htmlLink = actionLinks.find(
        (l) => /^html$/i.test(l.label) || /docs\.crestron\.com/i.test(l.url)
      );
      const primary =
        actionLinks.find((l) => l !== htmlLink) ??
        (titleUrl ? { label: "", url: titleUrl } : undefined);
      if (name && primary) {
        const label = primary.label.toUpperCase();
        docs.push({
          section,
          name,
          kind,
          description: description && description !== kind ? description : undefined,
          url: primary.url,
          format: label ? (label === "DOWNLOAD" ? "Download" : label) : undefined,
          htmlUrl: htmlLink && htmlLink.url !== primary.url ? htmlLink.url : undefined,
        });
      }
      return;
    }
    el.children().each((_, child) => walk(child));
  };
  $("body").children().each((_, child) => walk(child));
  return docs;
}

function parseSiblingRow($: CheerioRoot, el: Selection): CrestronRelatedItem | null {
  const nameEl = el.find(".sibling-name").first();
  const model = cleanText(nameEl.text());
  if (!model) return null;
  const link = nameEl.find("a[href]").attr("href");
  const qtyMatch = cleanText(el.text()).match(/Included Quantity\s*:\s*(\d+)/i);
  return {
    model,
    materialNumber: cleanText(el.find(".sibling-number").first().text()) || undefined,
    description: cleanText(el.find(".sibling-brand").first().text()) || undefined,
    url: absoluteUrl(link),
    quantity: qtyMatch ? Number(qtyMatch[1]) : undefined,
  };
}

function parseSiblingRows($: CheerioRoot, scope: Selection): CrestronRelatedItem[] {
  const items: CrestronRelatedItem[] = [];
  scope.find(".sibling-row").each((_, row) => {
    const item = parseSiblingRow($, $(row));
    if (item) items.push(item);
  });
  return items;
}

/** VariantProduct.ashx (load=list): "Available Models" + "In the box". */
export function parseVariants(html: string): {
  variants: CrestronRelatedItem[];
  inTheBox: CrestronRelatedItem[];
} {
  const $ = cheerio.load(html);
  const variants: CrestronRelatedItem[] = [];
  const inTheBox: CrestronRelatedItem[] = [];
  let current: "variants" | "box" | null = null;
  const walk = (node: AnyNode) => {
    const el = $(node);
    if (el.is("h4")) {
      const heading = cleanText(el.text()).toLowerCase();
      if (heading.includes("in the box")) current = "box";
      else if (heading.includes("model")) current = "variants";
      else current = null;
      return;
    }
    if (el.is(".sibling-row")) {
      const item = parseSiblingRow($, el);
      if (!item) return;
      if (current === "box" || el.hasClass("mahr-in-the-box")) inTheBox.push(item);
      else variants.push(item);
      return;
    }
    el.children().each((_, child) => walk(child));
  };
  $("body").children().each((_, child) => walk(child));
  return { variants, inTheBox };
}

/** OptionalAccessoriesHandler.ashx */
export function parseAccessories(html: string): CrestronRelatedItem[] {
  const $ = cheerio.load(html);
  return parseSiblingRows($, $("body"));
}

/** RelatedProducts.ashx (slider) y ReplacementProductsHandler.ashx */
export function parseProductSlider(html: string): CrestronRelatedItem[] {
  const $ = cheerio.load(html);
  const items: CrestronRelatedItem[] = [];
  $(".product-slider-slide").each((_, slide) => {
    const el = $(slide);
    const model = cleanText(el.find(".pst-top").first().text());
    if (!model) return;
    items.push({
      model,
      description: cleanText(el.find(".product-slider-name").first().text()) || undefined,
      url: absoluteUrl(el.find("a[href]").first().attr("href")),
      imageUrl: absoluteUrl(el.find("img").first().attr("src")),
    });
  });
  if (items.length === 0) {
    // Fallback: tabla de siblings (reemplazos usan el mismo layout que accesorios)
    return parseSiblingRows($, $("body"));
  }
  return items;
}

/** Convierte "PW-2420RU:1|C2N-IO:2|" en items con cantidad. */
export function parseIncludedAccessoriesAttr(value: string | undefined): CrestronRelatedItem[] {
  if (!value) return [];
  return value
    .split("|")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [model, qty] = chunk.split(":");
      const quantity = Number(qty);
      return {
        model: cleanText(model),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
      };
    })
    .filter((item) => item.model);
}
