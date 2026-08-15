import { NextResponse } from "next/server";
import { loadQuoteForUser } from "@/lib/quote-access";
import { getCompanyIdentity } from "@/lib/quote-defaults";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { quote } = await loadQuoteForUser(id);
  if (!quote) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const identity = await getCompanyIdentity();
  const origin = new URL(_req.url).origin;
  const abs = (path: string) => (path.startsWith("http") ? path : `${origin}${path}`);
  const logo = abs(identity.logoUrl);
  const total = quote.items.reduce((s, i) => s + Number(i.lineTotalUsd), 0);
  const sign = quote.owner.quoteSignName || quote.owner.name || "";
  const title = quote.owner.quoteSignTitle || "";
  const sections = quote.sections
    .filter((s) => s.included !== false && s.type !== "products_table")
    .map((s) => {
      const extra =
        s.type === "brands"
          ? `<p><img src="${escapeHtml(abs(identity.brandsUrl))}" width="640"/></p>`
          : s.type === "iso"
            ? `<p><img src="${escapeHtml(abs(identity.isoUrl))}" height="90"/></p>`
            : "";
      const body = s.body.trim()
        ? `<p style="white-space:pre-wrap;font-size:12px;line-height:1.45">${escapeHtml(s.body)}</p>`
        : "";
      return `<h2 style="font-size:14px;color:#1e3553;margin:18px 0 6px">${escapeHtml(s.title)}</h2>${body}${extra}`;
    })
    .join("");
  const rows = quote.items
    .map(
      (i) =>
        `<tr><td>${Number(i.quantity)}</td><td>${escapeHtml(i.unit)}</td><td>${escapeHtml(i.description)}</td><td>${formatUsd(Number(i.unitPriceUsd))}</td><td>${formatUsd(Number(i.lineTotalUsd))}</td>${quote.showDeliveryColumn ? `<td>${escapeHtml(i.deliveryKey || "")}</td>` : ""}</tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(quote.number)}</title></head>
<body style="font-family:Calibri,Arial,sans-serif;color:#111;max-width:800px">
${logo ? `<img src="${escapeHtml(logo)}" height="64"/>` : `<strong>SOUNDTEC</strong>`}
<p style="color:#1e3553;font-size:20px;margin:12px 0 4px">${escapeHtml(quote.number)}</p>
<p>${escapeHtml(quote.client?.companyName || "")}${quote.contactName ? " · " + escapeHtml(quote.contactName) : ""}</p>
<p><strong>${escapeHtml(quote.reference || "")}</strong></p>
${sections}
<h2 style="font-size:14px;color:#1e3553">Productos y servicios</h2>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:11px">
<tr style="background:#1e3553;color:#fff"><th>Cant</th><th>U</th><th>Detalle</th><th>Unit. USD</th><th>Total USD</th>${quote.showDeliveryColumn ? "<th>Entrega</th>" : ""}</tr>
${rows}
</table>
<p style="text-align:right;font-weight:bold">Total neto ${formatUsd(total)}</p>
<p style="margin-top:32px">${escapeHtml(sign)}<br/>${escapeHtml(title)}<br/>SOUNDTEC S.R.L.</p>
<img src="${escapeHtml(abs(identity.headerUrl))}" width="640"/>
</body></html>`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${quote.number}.doc"`,
    },
  });
}
