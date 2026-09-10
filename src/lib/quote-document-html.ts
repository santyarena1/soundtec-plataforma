import { promises as fs } from "node:fs";
import path from "node:path";
import {
  AI_SECTION_STUB,
  DEFAULT_BRANDS_PLACEMENT,
  DEFAULT_ISO_PLACEMENT,
  getCompanyIdentity,
  resolveImagePlacement,
  type ImagePlacement,
} from "@/lib/quote-defaults";
import { isRichText, sanitizeQuoteHtml, splitParagraphs } from "@/lib/quote-richtext";
import { formatUsd } from "@/lib/utils";
import { quoteItemDisplay } from "@/lib/quote-product-line";
import { buildQuoteZones, type QuoteGroupRecord } from "@/lib/quote-item-groups";

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
  product?: {
    normalizedName: string;
    shortDescription: string | null;
    brand?: { name: string } | null;
  } | null;
};

export type QuoteDocumentHtmlInput = {
  number: string;
  reference: string | null;
  contactName: string | null;
  issuedAt: Date | null;
  showDeliveryColumn: boolean;
  client: { companyName: string; tradeName: string | null } | null;
  owner: {
    quoteSignName: string | null;
    quoteSignTitle: string | null;
    name: string | null;
  };
  items: QuoteDocumentHtmlItem[];
  itemGroups?: QuoteGroupRecord[];
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
  }>;
};

function escapeHtml(value: string) {
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

async function resolveAssetSrc(url: string, origin?: string): Promise<string> {
  if (!url) return "";
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
  for (const section of [...quote.sections]
    .filter((section) => section.included !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (section.type === "products_table") continue;
    const body = (section.body ?? "").trim();
    const hasBody = body.length > 0 && body !== AI_SECTION_STUB;

    if (section.type === "letter_open" || section.type === "closing") {
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
      sectionChunks.push(
        `${heading(section.title)}${hasBody ? paragraphs(body) : ""}${await placedImage(brandsSrc, identity.brands)}`
      );
      continue;
    }
    if (section.type === "iso") {
      sectionChunks.push(
        `${heading(section.title)}${hasBody ? paragraphs(body) : ""}${await placedImage(isoSrc, identity.iso)}`
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
    sectionChunks.push(`${heading(section.title)}${hasBody ? paragraphs(body) : ""}${sectionImages}`);
  }

  const visibleItems = quote.items.filter((item) => !item.excluded);
  const total = visibleItems
    .filter((item) => !item.optional)
    .reduce((sum, item) => sum + Number(item.lineTotalUsd), 0);

  const itemRow = (item: QuoteDocumentHtmlItem, index: number) => {
    const line = quoteItemDisplay({ description: item.description, product: item.product });
    const detail = `<strong>${escapeHtml(line.name)}</strong>${
      line.blurb
        ? `<br/><span style="font-size:9pt;font-weight:normal;text-align:justify">${escapeHtml(line.blurb)}</span>`
        : ""
    }${item.optional ? " <i>(opcional)</i>" : ""}`;
    return `<tr style="background:${index % 2 ? "#f3f5f8" : "#ffffff"}">
<td style="border:.5pt solid #c9d0d8;padding:4pt;text-align:right">${Number(item.quantity)}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt">${escapeHtml(item.unit)}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt">${detail}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt;text-align:right">${formatUsd(Number(item.unitPriceUsd))}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt;text-align:right;font-weight:bold">${formatUsd(Number(item.lineTotalUsd))}</td>
${showDelivery ? `<td style="border:.5pt solid #c9d0d8;padding:4pt">${escapeHtml(item.deliveryKey || "")}</td>` : ""}
</tr>`;
  };

  const tableHead = `<table style="width:100%;font-size:9pt;border-collapse:collapse">
<tr style="background:${color};color:#fff">
<th style="border:.5pt solid ${color};padding:4pt;text-align:right">Cant.</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:left">Un.</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:left">Descripción</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:right">Unitario</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:right">Total</th>
${showDelivery ? `<th style="border:.5pt solid ${color};padding:4pt;text-align:left">Entrega</th>` : ""}
</tr>`;

  const zones = buildQuoteZones(visibleItems, quote.itemGroups ?? []);
  const multiTables = (quote.itemGroups?.length ?? 0) > 0;
  const equipmentHtml = zones
    .map((zone) => {
      const subtotal = zone.items
        .filter((item) => !item.optional)
        .reduce((sum, item) => sum + Number(item.lineTotalUsd), 0);
      return `${heading(zone.title)}${zone.body.trim() ? paragraphs(zone.body) : ""}${tableHead}
${zone.items.map(itemRow).join("")}
</table>
${multiTables ? `<p style="margin:8pt 0 0;text-align:right;font-size:10.5pt;font-weight:bold">Subtotal ${escapeHtml(zone.title)} ${formatUsd(subtotal)}</p>` : ""}`;
    })
    .join("<br/>");

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
</style>
</head>
<body>
<div class="${wrapperClass}">

<p style="margin:0"><img src="${escapeHtml(logoSrc)}" width="${CONTENT_WIDTH}" style="max-width:100%;height:auto"/></p>

<p style="margin:14pt 0 0;text-align:right;font-size:10pt">Ciudad Autónoma de Buenos Aires, ${escapeHtml(issued)}</p>

<table style="width:100%;margin-top:12pt;font-size:10.5pt">
<tr><td style="width:95pt;font-weight:bold;color:${color};padding:1pt 0">Señores</td><td style="font-weight:bold;padding:1pt 0">${escapeHtml(quote.client?.companyName || "")}</td></tr>
${quote.contactName ? `<tr><td style="font-weight:bold;color:${color};padding:1pt 0">At.</td><td style="padding:1pt 0">${escapeHtml(quote.contactName)}</td></tr>` : ""}
<tr><td style="font-weight:bold;color:${color};padding:1pt 0">Ref.</td><td style="padding:1pt 0">${escapeHtml(quote.reference || "")}</td></tr>
<tr><td style="font-weight:bold;color:${color};padding:1pt 0">Cotización</td><td style="font-weight:bold;color:${color};padding:1pt 0">${escapeHtml(quote.number)}</td></tr>
</table>

${sectionChunks.join("")}

<div style="page-break-before:always"></div>
${equipmentHtml}
<p style="margin:10pt 0 0;text-align:right;font-size:12pt;font-weight:bold;color:${color}">Total neto ${formatUsd(total)}</p>
<p style="margin:2pt 0 0;text-align:right;font-size:8pt;color:#556">Precios en dólares estadounidenses, IVA no incluido.</p>

<p style="margin-top:28pt;font-size:10.5pt"><b>${escapeHtml(signName)}</b><br/>${escapeHtml(signTitle)}<br/>${escapeHtml(identity.name)} S.R.L.</p>

<p style="margin-top:24pt"><img src="${escapeHtml(headerSrc)}" width="${CONTENT_WIDTH}" style="max-width:100%;height:auto"/></p>

</div>
</body></html>`;
}
