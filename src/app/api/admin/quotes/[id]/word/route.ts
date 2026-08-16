import { NextResponse } from "next/server";
import { loadQuoteForUser } from "@/lib/quote-access";
import { AI_SECTION_STUB, getCompanyIdentity } from "@/lib/quote-defaults";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Ancho útil de la hoja A4 con márgenes de 1,4 cm, en px a 96 dpi. */
const CONTENT_WIDTH = 680;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paragraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map(
      (chunk) =>
        `<p style="margin:0 0 8pt;text-align:justify;font-size:10.5pt;line-height:1.45">${escapeHtml(chunk).replaceAll("\n", "<br/>")}</p>`
    )
    .join("");
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { quote } = await loadQuoteForUser(id);
  if (!quote) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const identity = await getCompanyIdentity();
  const origin = new URL(req.url).origin;
  const abs = (path: string) => (path.startsWith("http") ? path : `${origin}${path}`);
  const color = identity.primary || "#1e3553";

  const visibleItems = quote.items.filter((item) => !item.excluded);
  const total = visibleItems
    .filter((item) => !item.optional)
    .reduce((sum, item) => sum + Number(item.lineTotalUsd), 0);
  const showDelivery = quote.showDeliveryColumn;
  const signName = quote.owner.quoteSignName || quote.owner.name || "";
  const signTitle = quote.owner.quoteSignTitle || "";
  const issued = (quote.issuedAt ?? new Date()).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const heading = (text: string) =>
    `<p style="margin:16pt 0 5pt;padding-bottom:2pt;border-bottom:1pt solid ${color};font-size:11pt;font-weight:bold;color:${color};text-transform:uppercase;letter-spacing:.5pt">${escapeHtml(text)}</p>`;

  const sections = quote.sections
    .filter((section) => section.included !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => {
      if (section.type === "products_table") return "";
      const body = section.body.trim();
      const hasBody = body.length > 0 && body !== AI_SECTION_STUB;

      if (section.type === "letter_open" || section.type === "closing") {
        return hasBody ? `<div style="margin-top:12pt">${paragraphs(body)}</div>` : "";
      }
      if (section.type === "disciplines") {
        return hasBody
          ? `<p style="margin:16pt 0;padding:6pt;background:${color};color:#fff;text-align:center;font-size:10pt;font-weight:bold;text-transform:uppercase;letter-spacing:1pt">${escapeHtml(body)}</p>`
          : "";
      }
      if (section.type === "brands") {
        return `${heading(section.title)}${hasBody ? paragraphs(body) : ""}<p style="margin:8pt 0"><img src="${escapeHtml(abs(identity.brandsUrl))}" width="${CONTENT_WIDTH}"/></p>`;
      }
      if (section.type === "iso") {
        return `${heading(section.title)}${hasBody ? paragraphs(body) : ""}<p style="margin:8pt 0"><img src="${escapeHtml(abs(identity.isoUrl))}" width="170"/></p>`;
      }
      if (!hasBody) return "";
      return `${heading(section.title)}${paragraphs(body)}`;
    })
    .join("");

  const rows = visibleItems
    .map(
      (item, index) =>
        `<tr style="background:${index % 2 ? "#f3f5f8" : "#ffffff"}">
<td style="border:.5pt solid #c9d0d8;padding:4pt;text-align:right">${Number(item.quantity)}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt">${escapeHtml(item.unit)}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt">${escapeHtml(item.description).replaceAll("\n", "<br/>")}${item.optional ? " <i>(opcional)</i>" : ""}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt;text-align:right">${formatUsd(Number(item.unitPriceUsd))}</td>
<td style="border:.5pt solid #c9d0d8;padding:4pt;text-align:right;font-weight:bold">${formatUsd(Number(item.lineTotalUsd))}</td>
${showDelivery ? `<td style="border:.5pt solid #c9d0d8;padding:4pt">${escapeHtml(item.deliveryKey || "")}</td>` : ""}
</tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${escapeHtml(quote.number)}</title>
<style>
@page WordSection1 { size: 21cm 29.7cm; margin: 2cm 1.4cm 2cm 1.4cm; }
div.WordSection1 { page: WordSection1; }
body { font-family: Calibri, Arial, sans-serif; color: #16212f; font-size: 10.5pt; }
table { border-collapse: collapse; }
</style>
</head>
<body>
<div class="WordSection1">

<p style="margin:0"><img src="${escapeHtml(abs(identity.logoUrl))}" width="${CONTENT_WIDTH}"/></p>

<p style="margin:14pt 0 0;text-align:right;font-size:10pt">Ciudad Autónoma de Buenos Aires, ${escapeHtml(issued)}</p>

<table style="width:100%;margin-top:12pt;font-size:10.5pt">
<tr><td style="width:95pt;font-weight:bold;color:${color};padding:1pt 0">Señores</td><td style="font-weight:bold;padding:1pt 0">${escapeHtml(quote.client?.companyName || "")}</td></tr>
${quote.contactName ? `<tr><td style="font-weight:bold;color:${color};padding:1pt 0">At.</td><td style="padding:1pt 0">${escapeHtml(quote.contactName)}</td></tr>` : ""}
<tr><td style="font-weight:bold;color:${color};padding:1pt 0">Ref.</td><td style="padding:1pt 0">${escapeHtml(quote.reference || "")}</td></tr>
<tr><td style="font-weight:bold;color:${color};padding:1pt 0">Cotización</td><td style="font-weight:bold;color:${color};padding:1pt 0">${escapeHtml(quote.number)}</td></tr>
</table>

${sections}

<br style="page-break-before:always"/>
${heading("Planilla de equipamiento y servicios")}
<table style="width:100%;font-size:9pt">
<tr style="background:${color};color:#fff">
<th style="border:.5pt solid ${color};padding:4pt;text-align:right">Cant.</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:left">Un.</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:left">Descripción</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:right">Unitario</th>
<th style="border:.5pt solid ${color};padding:4pt;text-align:right">Total</th>
${showDelivery ? `<th style="border:.5pt solid ${color};padding:4pt;text-align:left">Entrega</th>` : ""}
</tr>
${rows}
</table>
<p style="margin:10pt 0 0;text-align:right;font-size:12pt;font-weight:bold;color:${color}">Total neto ${formatUsd(total)}</p>
<p style="margin:2pt 0 0;text-align:right;font-size:8pt;color:#556">Precios en dólares estadounidenses, IVA no incluido.</p>

<p style="margin-top:28pt;font-size:10.5pt"><b>${escapeHtml(signName)}</b><br/>${escapeHtml(signTitle)}<br/>${escapeHtml(identity.name)} S.R.L.</p>

<p style="margin-top:24pt"><img src="${escapeHtml(abs(identity.headerUrl))}" width="${CONTENT_WIDTH}"/></p>

</div>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${quote.number}.doc"`,
    },
  });
}
