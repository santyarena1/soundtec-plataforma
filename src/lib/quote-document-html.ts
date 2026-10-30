import { quoteReferenceOrNumber } from "@/lib/quote-status";
import { alignCommercialTermsText } from "@/lib/quote-terms-text";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  AI_SECTION_STUB,
  DEFAULT_BRANDS_PLACEMENT,
  DEFAULT_ISO_PLACEMENT,
  getCompanyIdentity,
  QUOTE_MODULES,
  resolveImagePlacement,
  type ImagePlacement,
} from "@/lib/quote-defaults";
import { orderQuoteSections } from "@/lib/quote-section-order";
import { optimizedImage } from "@/lib/image-url";
import { servedFileAsDataUri } from "@/lib/blob-storage";

/** Marcas donde van la planilla y la firma dentro del cuerpo (se reemplazan al final). */
const EQUIPMENT_SLOT = "<!--quote-equipment-->";
const SIGNATURE_SLOT = "<!--quote-signature-->";
import { isRichText, sanitizeQuoteHtml, splitParagraphs } from "@/lib/quote-richtext";
import { formatUsd } from "@/lib/utils";
import { quoteItemDisplay } from "@/lib/quote-product-line";
import { buildQuoteZones, type QuoteGroupRecord } from "@/lib/quote-item-groups";
import { defaultAlternativeId, rowsOfAlternative, sortAlternatives } from "@/lib/quote-alternatives";
import {
  computeQuoteTotals,
  taxLabel,
  taxNote,
  type QuoteTaxMode,
} from "@/lib/quote-totals";

const CONTENT_WIDTH = 680;

export type QuoteDocumentHtmlItem = {
  quantity: unknown;
  unit: string;
  description: string;
  unitPriceUsd: unknown;
  lineTotalUsd: unknown;
  optional: boolean;
  excluded: boolean;
  deliveryKey: string | null;
  groupId?: string | null;
  alternativeId?: string | null;
  productId?: string | null;
  ivaRate?: unknown;
  /** Nota del producto: sale debajo solo si notesVisible. */
  notes?: string | null;
  notesVisible?: boolean;
  product?: {
    normalizedName: string;
    shortDescription: string | null;
    brand?: { name: string } | null;
    /** Foto del catálogo: se usa si la cotización no tiene una propia para el producto. */
    images?: Array<{ url: string }>;
  } | null;
};

export type QuoteDocumentHtmlInput = {
  number: string;
  reference: string | null;
  contactName: string | null;
  issuedAt: Date | null;
  showDeliveryColumn: boolean;
  /** Fotos de los productos en la planilla (por defecto sí). */
  showProductPhotos?: boolean;
  taxMode?: QuoteTaxMode | null;
  client: { companyName: string; tradeName: string | null } | null;
  owner: {
    quoteSignName: string | null;
    quoteSignTitle: string | null;
    name: string | null;
  };
  items: QuoteDocumentHtmlItem[];
  itemGroups?: QuoteGroupRecord[];
  /** Opciones cotizadas. Con más de una, cada una lleva su tabla y su total. */
  alternatives?: Array<{ id: string; name: string; purpose: string | null; sortOrder: number; isDefault?: boolean }>;
  /** Modo «logos individuales»: las marcas elegidas en la cotización (vacío = collage institucional). */
  brandLogos?: Array<{ label: string; url: string }>;
  terms?: {
    paymentTerms: string | null;
    paymentReference: string | null;
    deliveryText: string | null;
    validityDays: number;
    productWarranty: string | null;
  } | null;
  sections: Array<{
    id?: string;
    type: string;
    title: string;
    body: string;
    included: boolean;
    sortOrder: number;
    layout?: string | null;
  }>;
  assets?: Array<{
    id: string;
    url: string;
    sectionId: string | null;
    sortOrder: number;
    productId?: string | null;
    kind?: string | null;
  }>;
};

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paragraphs(body: string) {
  if (isRichText(body)) return `<div class="rt">${sanitizeQuoteHtml(body)}</div>`;
  return splitParagraphs(body)
    .map(
      (chunk) =>
        `<p style="margin:0 0 8pt;text-align:justify;font-size:10.5pt;line-height:1.45;page-break-inside:avoid">${escapeHtml(chunk).replaceAll("\n", "<br/>")}</p>`
    )
    .join("");
}

async function fileToDataUri(publicPath: string): Promise<string | null> {
  try {
    const abs = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    const bytes = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".svg"
            ? "image/svg+xml"
            : ext === ".webp"
              ? "image/webp"
              : "application/octet-stream";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function resolveAssetSrc(url: string, origin?: string): Promise<string> {
  if (!url) return "";
  // Archivos propios (planos, imágenes subidas): se leen directo, el PDF no tiene sesión.
  if (url.includes("/api/files/")) {
    const inline = await servedFileAsDataUri(url);
    if (inline) return inline;
  }
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) {
    const embedded = await fileToDataUri(url);
    if (embedded) return embedded;
    if (origin) return `${origin}${url}`;
  }
  return url;
}

/**
 * HTML tipográfico de la COT (mismo look que Vista PDF / Word).
 * Fuente única para el PDF emitido y el export Word.
 */
/** Grilla de logos (4 por fila), igual a la de la vista previa. */
async function brandLogoGrid(logos: Array<{ label: string; url: string }>, origin?: string): Promise<string> {
  const cells = await Promise.all(
    logos.map(async (logo) => {
      const src = await resolveAssetSrc(logo.url, origin);
      return src
        ? `<td style="width:25%;padding:6pt;text-align:center;vertical-align:middle;border:.5pt solid #e2e6ea"><img src="${escapeHtml(src)}" alt="${escapeHtml(logo.label)}" style="max-width:100%;max-height:34pt;object-fit:contain"/></td>`
        : `<td style="width:25%;padding:6pt;text-align:center;vertical-align:middle;border:.5pt solid #e2e6ea;font-size:9pt;font-weight:bold">${escapeHtml(logo.label)}</td>`;
    })
  );
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 4) {
    const row = cells.slice(i, i + 4);
    while (row.length < 4) row.push('<td style="width:25%"></td>');
    rows.push(`<tr>${row.join("")}</tr>`);
  }
  return `<table style="width:100%;border-collapse:collapse;margin-top:6pt">${rows.join("")}</table>`;
}

export async function buildQuoteDocumentHtml(
  quote: QuoteDocumentHtmlInput,
  options?: { origin?: string; forWord?: boolean }
): Promise<string> {
  const rawIdentity = await getCompanyIdentity();
  const identity = {
    ...rawIdentity,
    primary: rawIdentity.primary || "#1e3553",
    brands: resolveImagePlacement(rawIdentity.brands, DEFAULT_BRANDS_PLACEMENT),
    iso: resolveImagePlacement(rawIdentity.iso, DEFAULT_ISO_PLACEMENT),
  };
  const color = identity.primary;
  const origin = options?.origin;

  const logoSrc = await resolveAssetSrc(identity.logoUrl, origin);
  const headerSrc = await resolveAssetSrc(identity.headerUrl, origin);
  const brandsSrc = await resolveAssetSrc(identity.brandsUrl, origin);
  const isoSrc = await resolveAssetSrc(identity.isoUrl, origin);

  const placedImage = async (url: string, placement?: ImagePlacement | null) => {
    const safe = resolveImagePlacement(placement, DEFAULT_BRANDS_PLACEMENT);
    const src = await resolveAssetSrc(url, origin);
    return `<p style="margin:8pt 0;text-align:${safe.align}"><img src="${escapeHtml(src)}" width="${Math.round((CONTENT_WIDTH * safe.width) / 100)}" style="max-width:100%;height:auto"/></p>`;
  };

  const heading = (text: string) =>
    `<p style="margin:16pt 0 5pt;padding-bottom:2pt;border-bottom:1pt solid ${color};font-size:11pt;font-weight:bold;color:${color};text-transform:uppercase;letter-spacing:.5pt;page-break-after:avoid">${escapeHtml(text)}</p>`;

  const issued = (quote.issuedAt ?? new Date()).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const signName = quote.owner.quoteSignName || quote.owner.name || "";
  const signTitle = quote.owner.quoteSignTitle || "";
  const showDelivery = quote.showDeliveryColumn;
  const assets = quote.assets ?? [];

  const sectionChunks: string[] = [];
  const moduleOrder = QUOTE_MODULES.map((m) => m.key);
  for (const section of orderQuoteSections(
    // La planilla sale siempre: es lo que el cliente compra.
    quote.sections.filter((section) => section.included !== false || section.type === "products_table"),
    moduleOrder
  )) {
    if (section.type === "products_table") {
      if (!sectionChunks.includes(EQUIPMENT_SLOT)) sectionChunks.push(EQUIPMENT_SLOT);
      continue;
    }
    const sectionBody = (section.body ?? "").trim();
    const sectionHasBody = sectionBody.length > 0 && sectionBody !== AI_SECTION_STUB;
    if (section.type === "commercial_terms" && quote.terms && sectionHasBody) {
      // El texto fijo toma los datos cargados (forma de pago, vigencia, entrega…): no se contradice ni se repite en tabla.
      sectionChunks.push(`${heading(section.title)}${paragraphs(alignCommercialTermsText(sectionBody, quote.terms))}`);
      continue;
    }
    if (section.type === "commercial_terms" && quote.terms) {
      const rows: Array<[string, string]> = [];
      if (quote.terms.paymentTerms) rows.push(["Forma de pago", quote.terms.paymentTerms]);
      if (quote.terms.paymentReference) rows.push(["Referencia de pago", quote.terms.paymentReference]);
      if (quote.terms.deliveryText) rows.push(["Plazo de entrega", quote.terms.deliveryText]);
      rows.push(["Mantenimiento de la oferta", `${quote.terms.validityDays} días corridos`]);
      if (quote.terms.productWarranty) rows.push(["Garantía", quote.terms.productWarranty]);
      const termsTable = `<table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-top:4pt">${rows
        .map(
          ([label, value]) =>
            `<tr><td style="width:52mm;border-bottom:.5pt solid #e2e6ea;padding:3pt 6pt 3pt 0;vertical-align:top;font-weight:bold;color:${color}">${escapeHtml(
              label
            )}</td><td style="border-bottom:.5pt solid #e2e6ea;padding:3pt 0;vertical-align:top">${escapeHtml(value)}</td></tr>`
        )
        .join("")}</table>`;
      sectionChunks.push(`${heading(section.title)}${sectionHasBody ? paragraphs(sectionBody) : ""}${termsTable}`);
      continue;
    }
    const body = (section.body ?? "").trim();
    const hasBody = body.length > 0 && body !== AI_SECTION_STUB;

    if (section.type === "closing") {
      // El saludo final, la firma y el pie van juntos: nunca queda la firma sola en una hoja.
      sectionChunks.push(`<div style="margin-top:12pt;page-break-inside:avoid">${hasBody ? paragraphs(body) : ""}${SIGNATURE_SLOT}</div>`);
      continue;
    }
    if (section.type === "letter_open") {
      if (hasBody) sectionChunks.push(`<div style="margin-top:12pt">${paragraphs(body)}</div>`);
      continue;
    }
    if (section.type === "disciplines") {
      if (hasBody) {
        sectionChunks.push(
          `<p style="margin:16pt 0;padding:6pt;background:${color};color:#fff;text-align:center;font-size:10pt;font-weight:bold;text-transform:uppercase;letter-spacing:1pt">${escapeHtml(body)}</p>`
        );
      }
      continue;
    }
    if (section.type === "brands") {
      const logos = quote.brandLogos?.filter((logo) => logo.url.trim()) ?? [];
      const visual = logos.length ? await brandLogoGrid(logos, origin) : await placedImage(brandsSrc, identity.brands);
      sectionChunks.push(`<div style="page-break-inside:avoid">${heading(section.title)}${hasBody ? paragraphs(body) : ""}${visual}</div>`);
      continue;
    }
    if (section.type === "iso") {
      sectionChunks.push(
        `${heading(section.title)}${hasBody ? paragraphs(body) : ""}<div style="page-break-inside:avoid">${await placedImage(isoSrc, identity.iso)}</div>`
      );
      continue;
    }

    const sectionImages = (
      await Promise.all(
        assets
          .filter((asset) => asset.sectionId === section.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((asset) =>
            placedImage(asset.url, {
              width: section.layout === "images_row" ? 48 : 62,
              align: "center",
            })
          )
      )
    ).join("");
    if (!hasBody && !sectionImages) continue;
    // Sin cuerpo real ni imágenes no hay nada que mostrar: imprimir solo el
    // título deja un bloque vacío en un documento que ve el cliente.
    if (!hasBody && !sectionImages) continue;
    sectionChunks.push(`${heading(section.title)}${hasBody ? paragraphs(body) : ""}${sectionImages}`);
  }

  const visibleItems = quote.items.filter((item) => !item.excluded);
  const totals = computeQuoteTotals(visibleItems, quote.taxMode ?? "NOTE");
  // Las fotos de producto se mostraban en la vista previa y no llegaban al
  // documento del cliente, que es el que termina decidiendo la compra.
  const photoByProduct = new Map<string, string>();
  const photoSrc = async (url: string) => {
    // Archivos propios (fotos subidas a mano): son privados, el navegador del PDF
    // no tiene sesión. Se leen directo y van embebidos.
    if (url.includes("/api/files/") || !/^https?:\/\//i.test(url)) return resolveAssetSrc(url, origin);
    // Las fotos del fabricante pesan hasta 1 MB y algunos sitios no dejan
    // bajarlas directo: pasan por el optimizador propio, achicadas.
    // Word no lee WebP: ahí van tal cual.
    const optimized = origin && !options?.forWord ? optimizedImage(url, 256) : null;
    // Si el dominio no se optimiza, optimizedImage devuelve la URL tal cual (absoluta).
    return optimized ? (optimized.startsWith("/") ? `${origin}${optimized}` : optimized) : url;
  };
  if (quote.showProductPhotos !== false) {
    for (const asset of assets) {
      if (asset.kind === "PRODUCT" && asset.productId && !photoByProduct.has(asset.productId)) {
        const src = await photoSrc(asset.url);
        if (src) photoByProduct.set(asset.productId, src);
      }
    }
    // Sin foto propia en la cotización (p. ej. la rápida): la del catálogo.
    for (const item of visibleItems) {
      const catalog = item.product?.images?.[0]?.url;
      if (!item.productId || photoByProduct.has(item.productId) || !catalog) continue;
      const src = await photoSrc(catalog);
      if (src) photoByProduct.set(item.productId, src);
    }
  }
  const anyPhoto = quote.showProductPhotos !== false && visibleItems.some((item) => item.productId && photoByProduct.has(item.productId));
  const showTax = (quote.taxMode ?? "NOTE") === "ADDED";

  const itemRow = (item: QuoteDocumentHtmlItem, index: number) => {
    const line = quoteItemDisplay({ description: item.description, product: item.product });
    const detail = `<strong>${escapeHtml(line.name)}</strong>${
      line.blurb
        ? `<br/><span style="font-size:9pt;font-weight:normal;text-align:justify">${escapeHtml(line.blurb)}</span>`
        : ""
    }${
      item.optional
        ? ` <span style="display:inline-block;margin-left:3pt;padding:0 4pt;border:.75pt solid ${color};border-radius:3pt;color:${color};font-size:7.5pt;font-weight:bold;letter-spacing:.3pt;text-transform:uppercase;vertical-align:1pt">Opcional</span>`
        : ""
    }${
      item.notesVisible && item.notes?.trim() && item.notes.trim() !== "Incluido"
        ? `<br/><span style="font-size:8.5pt;font-weight:normal;font-style:italic;color:#445">${escapeHtml(item.notes.trim()).replaceAll("\n", "<br/>")}</span>`
        : ""
    }`;
    const photo = item.productId ? photoByProduct.get(item.productId) : null;
    const photoCell = anyPhoto
      ? `<td style="border:.5pt solid #c9d0d8;padding:3pt;text-align:center">${
          photo
            ? `<img src="${escapeHtml(photo)}" style="max-width:52pt;max-height:52pt;object-fit:contain" onerror="this.remove()"/>`
            : ""
        }</td>`
      : "";
    return `<tr style="background:${index % 2 ? "#f3f5f8" : "#ffffff"}">
${photoCell}<td style="border:.5pt solid #c9d0d8;padding:4pt;text-align:right">${Number(item.quantity)}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt">${escapeHtml(item.unit)}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt">${detail}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt;text-align:right">${Number(item.unitPriceUsd) !== 0 ? formatUsd(Number(item.unitPriceUsd)) : "Sin cargo"}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt;text-align:right;font-weight:bold">${Number(item.lineTotalUsd) !== 0 ? formatUsd(Number(item.lineTotalUsd)) : "—"}</td>
${showTax ? `<td style="border:.5pt solid #c9d0d8;padding:4pt;text-align:right">${Number(item.ivaRate ?? 0)}%</td>` : ""}
${showDelivery ? `<td style="border:.5pt solid #c9d0d8;padding:4pt">${escapeHtml(item.deliveryKey || quote.terms?.deliveryText || "")}</td>` : ""}
</tr>`;
  };

  // thead: el encabezado se repite en cada hoja cuando la planilla sigue en la próxima.
  const tableHead = `<table style="width:100%;font-size:9pt;border-collapse:collapse">
<thead style="display:table-header-group"><tr style="background:${color};color:#fff">
${anyPhoto ? `<th style="border:.5pt solid ${color};padding:4pt;text-align:center">Foto</th>` : ""}<th style="border:.5pt solid ${color};padding:4pt;text-align:right">Cant.</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:left">Un.</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:left">Descripción</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:right">Unitario</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:right">Total</th>
${showTax ? `<th style="border:.5pt solid ${color};padding:4pt;text-align:right">IVA</th>` : ""}
${showDelivery ? `<th style="border:.5pt solid ${color};padding:4pt;text-align:left">Entrega</th>` : ""}
</tr></thead><tbody>`;

  // Con una sola opción el documento se arma como siempre. Con más de una,
  // cada opción lleva su tabla y su total: sumarlas daría un precio que
  // nadie va a pagar, porque el cliente elige una.
  // Cada alternativa tiene su planilla (con sus propios ambientes). Los ítems y
  // ambientes sin alternativa (cotizaciones viejas) son de la por defecto.
  const alternatives = sortAlternatives((quote.alternatives ?? []).map((a) => ({ ...a, isDefault: a.isDefault ?? false })));
  const usedAlternatives = alternatives.filter((alternative) => rowsOfAlternative(visibleItems, alternative.id, alternatives).length > 0);
  const multiAlternative = usedAlternatives.length > 1;

  const renderItems = (items: QuoteDocumentHtmlItem[], groups: QuoteGroupRecord[]) => {
    // Un ambiente sin productos no sale en el documento del cliente.
    const used = groups.filter((group) => items.some((item) => item.groupId === group.id));
    const zones = buildQuoteZones(items, used);
    const multiTables = used.length > 0;
    return zones
      .map((zone) => {
        const subtotal = zone.items.reduce((sum, item) => sum + Number(item.lineTotalUsd), 0);
        return `${heading(zone.title)}${zone.body.trim() ? paragraphs(zone.body) : ""}${tableHead}
${zone.items.map(itemRow).join("")}
</tbody></table>
${multiTables ? `<p style="margin:8pt 0 0;text-align:right;font-size:10.5pt;font-weight:bold">Subtotal ${escapeHtml(zone.title)} ${formatUsd(subtotal)}</p>` : ""}`;
      })
      .join("<br/>");
  };

  const equipmentHtml = multiAlternative
    ? usedAlternatives
        .map((alternative) => {
          const items = rowsOfAlternative(visibleItems, alternative.id, alternatives);
          const groups = rowsOfAlternative(quote.itemGroups ?? [], alternative.id, alternatives);
          const optionTotal = computeQuoteTotals(items, quote.taxMode ?? "NOTE");
          const optionTotals =
            optionTotal.mode === "ADDED"
              ? `<p style="margin:8pt 0 0;text-align:right;font-size:10pt">Neto ${formatUsd(optionTotal.net)} · ${escapeHtml(taxLabel(optionTotal))} ${formatUsd(optionTotal.tax)}</p>`
              : "";
          return `<div style="margin-top:14pt;padding:6pt 9pt;background:${color};color:#fff;font-size:12pt;font-weight:bold;letter-spacing:.3pt;page-break-after:avoid">${escapeHtml(alternative.name)}</div>${
            alternative.purpose ? `<div style="margin-top:6pt">${paragraphs(alternative.purpose)}</div>` : ""
          }${renderItems(items, groups)}${optionTotals}
<p style="margin:6pt 0 0;text-align:right;font-size:12pt;font-weight:bold;color:${color}">Total ${escapeHtml(
            alternative.name
          )} ${formatUsd(optionTotal.total)}</p>`;
        })
        .join('<div style="height:14pt"></div>')
    : renderItems(
        visibleItems,
        alternatives.length === 0
          ? quote.itemGroups ?? []
          : rowsOfAlternative(quote.itemGroups ?? [], usedAlternatives[0]?.id ?? defaultAlternativeId(alternatives), alternatives)
      );

  // Planilla + totales en el lugar de «Productos y servicios»; firma y pie con el cierre.
  const totalsHtml = `<div style="page-break-inside:avoid">${multiAlternative ? "" : totals.mode === "ADDED"
  ? `<table style="margin:10pt 0 0;margin-left:auto;font-size:10.5pt">
<tr><td style="padding:1pt 10pt 1pt 0;text-align:right">Neto</td><td style="padding:1pt 0;text-align:right">${formatUsd(totals.net)}</td></tr>
<tr><td style="padding:1pt 10pt 1pt 0;text-align:right">${escapeHtml(taxLabel(totals))}</td><td style="padding:1pt 0;text-align:right">${formatUsd(totals.tax)}</td></tr>
<tr><td style="padding:3pt 10pt 1pt 0;text-align:right;font-size:12pt;font-weight:bold;color:${color}">Total</td><td style="padding:3pt 0 1pt;text-align:right;font-size:12pt;font-weight:bold;color:${color}">${formatUsd(totals.total)}</td></tr>
</table>`
  : `<p style="margin:10pt 0 0;text-align:right;font-size:12pt;font-weight:bold;color:${color}">Total neto ${formatUsd(totals.net)}</p>`}
${taxNote(totals) ? `<p style="margin:2pt 0 0;text-align:right;font-size:8pt;color:#556">${escapeHtml(taxNote(totals) as string)}</p>` : ""}</div>`;
  const equipmentBlock = `${equipmentHtml}
${totalsHtml}`;
  const signatureBlock = `<p style="margin-top:28pt;font-size:10.5pt"><b>${escapeHtml(signName)}</b><br/>${escapeHtml(signTitle)}<br/>${escapeHtml(identity.name)} S.R.L.</p>
<p style="margin-top:24pt"><img src="${escapeHtml(headerSrc)}" width="${CONTENT_WIDTH}" style="max-width:100%;height:auto"/></p>`;
  let body = sectionChunks.join("");
  body = body.includes(EQUIPMENT_SLOT) ? body.replace(EQUIPMENT_SLOT, () => equipmentBlock) : `${body}${equipmentBlock}`;
  body = body.includes(SIGNATURE_SLOT)
    ? body.replace(SIGNATURE_SLOT, () => signatureBlock)
    : `${body}<div style="page-break-inside:avoid">${signatureBlock}</div>`;

  const wordMeta = options?.forWord
    ? `xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"`
    : "";
  const pageCss = options?.forWord
    ? `@page WordSection1 { size: 21cm 29.7cm; margin: 2cm 1.4cm 2cm 1.4cm; }
div.WordSection1 { page: WordSection1; }`
    : `@page { size: A4; margin: 14mm 12mm 16mm 12mm; }`;
  const wrapperClass = options?.forWord ? "WordSection1" : "quote-export";

  return `<!DOCTYPE html>
<html ${wordMeta}>
<head><meta charset="utf-8"><title>${escapeHtml(quote.number)}</title>
<style>
${pageCss}
body { font-family: Calibri, "Segoe UI", Arial, sans-serif; color: #16212f; font-size: 10.5pt; margin: 0; }
table { border-collapse: collapse; }
.rt p { margin: 0 0 8pt; font-size: 10.5pt; line-height: 1.45; page-break-inside: avoid; }
.rt h3 { margin: 0 0 3pt; font-size: 10.5pt; font-weight: bold; page-break-after: avoid; }
.rt ul, .rt ol { margin: 0 0 8pt 18pt; }
.rt li { margin-bottom: 2pt; font-size: 10.5pt; line-height: 1.45; }
tr { page-break-inside: avoid; break-inside: avoid; }
thead { display: table-header-group; }
</style>
</head>
<body>
<div class="${wrapperClass}">

<p style="margin:0"><img src="${escapeHtml(logoSrc)}" width="${CONTENT_WIDTH}" style="max-width:100%;height:auto"/></p>

<p style="margin:14pt 0 0;text-align:right;font-size:10pt">Ciudad Autónoma de Buenos Aires, ${escapeHtml(issued)}</p>

<table style="width:100%;margin-top:12pt;font-size:10.5pt">
<tr><td style="width:95pt;font-weight:bold;color:${color};padding:1pt 0">Señores</td><td style="font-weight:bold;padding:1pt 0">${escapeHtml(quote.client?.companyName || "")}</td></tr>
${quote.contactName ? `<tr><td style="font-weight:bold;color:${color};padding:1pt 0">At.</td><td style="padding:1pt 0">${escapeHtml(quote.contactName)}</td></tr>` : ""}
<tr><td style="font-weight:bold;color:${color};padding:1pt 0">Ref.</td><td style="padding:1pt 0">${escapeHtml(quoteReferenceOrNumber(quote.reference, quote.number))}</td></tr>
<tr><td style="font-weight:bold;color:${color};padding:1pt 0">Cotización</td><td style="font-weight:bold;color:${color};padding:1pt 0">${escapeHtml(quote.number)}</td></tr>
</table>

${body}

</div>
</body></html>`;
}
