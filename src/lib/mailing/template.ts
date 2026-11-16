import { MAIL_FONT, SOUNDTEC_BLUE, escapeHtml } from "@/lib/mail/html";
import type { MailBlock, ProductItem } from "@/lib/mailing/blocks";
import { fillVariables, type MailContact } from "@/lib/mailing/variables";

/**
 * Plantilla de las campañas: logo arriba, bloques apilados en una columna de
 * 600 px y pie con la dirección y el enlace de baja. Tablas y estilos en línea
 * (Gmail y Outlook ignoran las hojas de estilo); en el celular la grilla de
 * productos pasa a una columna. Sin dependencias de servidor: la misma función
 * arma la vista previa del panel y el mail que sale.
 */

export type CampaignFooter = {
  /** «Soundtec S.R.L.» */
  company: string;
  /** Dirección postal (la pide la ley y la exigen Gmail/Yahoo para envíos masivos). */
  address: string;
  /** Por qué le llega («Recibís este mail porque sos cliente de Soundtec…»). */
  reason: string;
};

export type RenderCampaignInput = {
  subject: string;
  preheader?: string;
  blocks: MailBlock[];
  contact: MailContact;
  /** Enlace de baja personal (en la vista previa, «#»). */
  unsubscribeUrl: string;
  footer: CampaignFooter;
  /** Origen absoluto del sitio (para el logo y las rutas relativas). */
  origin: string;
};

const BLUE = SOUNDTEC_BLUE;
const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const FONT = MAIL_FONT;

function absolute(url: string, origin: string): string {
  const value = url.trim();
  if (!value) return "";
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${origin}${value}`;
  return `https://${value}`;
}

/** Texto con párrafos, **negrita**, [enlaces](https://…) y direcciones sueltas clickeables. */
export function inlineText(raw: string, origin: string): string {
  const links: string[] = [];
  let html = escapeHtml(raw).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
    links.push(`<a href="${escapeHtml(absolute(href.replace(/&amp;/g, "&"), origin))}" style="color:${BLUE};font-weight:600;text-decoration:underline">${label}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  html = html.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre: string, href: string) => `${pre}<a href="${href}" style="color:${BLUE};text-decoration:underline;word-break:break-all">${href}</a>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${INK}">$1</strong>`);
  return html.replace(/\u0000(\d+)\u0000/g, (_, i: string) => links[Number(i)] ?? "");
}

function paragraphs(text: string, origin: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${BODY}">${inlineText(p, origin).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function row(inner: string, padding = "0 40px"): string {
  return `<tr><td class="px" style="padding:${padding}">${inner}</td></tr>`;
}

function button(label: string, href: string, origin: string): string {
  if (!label.trim() || !href.trim()) return "";
  const url = escapeHtml(absolute(href, origin));
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px 0 22px"><tr><td style="background:${BLUE};border-radius:10px">
<a href="${url}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(label)} &rarr;</a>
</td></tr></table>`;
}

function productCard(item: ProductItem, cta: string, origin: string): string {
  const href = escapeHtml(absolute(item.url, origin));
  const image = item.imageUrl
    ? `<a href="${href}" style="text-decoration:none"><img src="${escapeHtml(absolute(item.imageUrl, origin))}" width="236" alt="${escapeHtml(item.title)}" style="display:block;width:100%;max-width:236px;height:auto;max-height:200px;margin:0 auto;border:0;object-fit:contain"></a>`
    : `<div style="height:120px"></div>`;
  const badge = item.badge.trim()
    ? `<p style="margin:0 0 10px"><span style="display:inline-block;padding:3px 9px;border-radius:999px;background:#fff4e5;color:#9a3412;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${escapeHtml(item.badge)}</span></p>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:14px">
<tr><td style="padding:16px 16px 6px">${badge}<div style="background:#ffffff;text-align:center">${image}</div></td></tr>
<tr><td style="padding:10px 16px 18px">
${item.brand ? `<p style="margin:0;font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};font-weight:600">${escapeHtml(item.brand)}</p>` : ""}
<p style="margin:4px 0 0;font-family:${FONT};font-size:17px;line-height:1.3;color:${INK};font-weight:700">${escapeHtml(item.title)}</p>
${item.subtitle ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:13px;line-height:1.45;color:${MUTED}">${escapeHtml(item.subtitle.length > 110 ? `${item.subtitle.slice(0, 107)}…` : item.subtitle)}</p>` : ""}
${item.priceText.trim() ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:16px;color:${BLUE};font-weight:700">${escapeHtml(item.priceText)}</p>` : ""}
${item.url && cta.trim() ? `<p style="margin:12px 0 0"><a href="${href}" style="font-family:${FONT};font-size:14px;font-weight:600;color:${BLUE};text-decoration:none">${escapeHtml(cta)} &rarr;</a></p>` : ""}
</td></tr></table>`;
}

function productsGrid(items: ProductItem[], cta: string, origin: string): string {
  if (!items.length) return "";
  if (items.length === 1) return productCard(items[0]!, cta, origin);
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const left = productCard(items[i]!, cta, origin);
    const right = items[i + 1] ? productCard(items[i + 1]!, cta, origin) : "";
    rows.push(
      `<tr><td class="col" width="50%" valign="top" style="padding:0 8px 16px 0">${left}</td><td class="col" width="50%" valign="top" style="padding:0 0 16px 8px">${right}</td></tr>`
    );
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows.join("")}</table>`;
}

function renderBlock(block: MailBlock, contact: MailContact, origin: string): string {
  const fill = (value: string) => fillVariables(value, contact);
  switch (block.type) {
    case "heading": {
      const size = block.size === "lg" ? 21 : 28;
      return block.text.trim()
        ? row(`<h${block.size === "lg" ? 2 : 1} style="margin:0 0 16px;font-family:${FONT};font-size:${size}px;line-height:1.2;color:${INK};font-weight:700;letter-spacing:-0.3px">${escapeHtml(fill(block.text))}</h${block.size === "lg" ? 2 : 1}>`)
        : "";
    }
    case "text":
      return block.text.trim() ? row(paragraphs(fill(block.text), origin)) : "";
    case "image": {
      if (!block.url.trim()) return "";
      const img = `<img src="${escapeHtml(absolute(block.url, origin))}" width="520" alt="${escapeHtml(block.alt)}" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px">`;
      return row(`<div style="margin:0 0 20px">${block.href.trim() ? `<a href="${escapeHtml(absolute(block.href, origin))}">${img}</a>` : img}</div>`);
    }
    case "button":
      return row(button(fill(block.label), block.href, origin));
    case "products": {
      const title = block.title.trim()
        ? `<p style="margin:4px 0 14px;font-family:${FONT};font-size:12px;letter-spacing:2.5px;text-transform:uppercase;color:${MUTED};font-weight:700">${escapeHtml(fill(block.title))}</p>`
        : "";
      const grid = productsGrid(block.items, block.cta, origin);
      return grid ? row(`${title}${grid}<div style="height:6px"></div>`) : "";
    }
    case "divider":
      return row(`<div style="height:1px;background:#e5e7eb;margin:8px 0 24px;line-height:1px;font-size:1px">&nbsp;</div>`);
  }
}

function plainText(blocks: MailBlock[], contact: MailContact, origin: string): string {
  const parts: string[] = [];
  for (const block of blocks) {
    const fill = (value: string) => fillVariables(value, contact);
    if (block.type === "heading" && block.text.trim()) parts.push(fill(block.text).toUpperCase());
    if (block.type === "text" && block.text.trim()) parts.push(fill(block.text).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)"));
    if (block.type === "button" && block.label.trim() && block.href.trim()) parts.push(`${fill(block.label)}: ${absolute(block.href, origin)}`);
    if (block.type === "image" && block.href.trim()) parts.push(absolute(block.href, origin));
    if (block.type === "products") {
      if (block.title.trim()) parts.push(fill(block.title));
      for (const item of block.items) {
        parts.push([item.brand ? `${item.brand} ${item.title}` : item.title, item.priceText, item.url ? absolute(item.url, origin) : ""].filter(Boolean).join(" · "));
      }
    }
    if (block.type === "divider") parts.push("—");
  }
  return parts.join("\n\n");
}

export function renderCampaignEmail(input: RenderCampaignInput): { subject: string; html: string; text: string } {
  const { contact, origin } = input;
  const subject = fillVariables(input.subject.trim() || "(sin asunto)", contact);
  const preheader = fillVariables(input.preheader?.trim() ?? "", contact);
  const body = input.blocks.map((b) => renderBlock(b, contact, origin)).join("\n");
  const unsubscribe = escapeHtml(input.unsubscribeUrl);
  const footer = input.footer;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><title>${escapeHtml(subject)}</title>
<style>@media only screen and (max-width:600px){.px{padding-left:20px!important;padding-right:20px!important}.col{display:block!important;width:100%!important;padding:0 0 14px 0!important}}</style></head>
<body style="margin:0;padding:0;background:#eef0f3;font-family:${FONT};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preheader)}${"&#8199;&#847; ".repeat(40)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef0f3;padding:28px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
<tr><td style="height:6px;background:${BLUE};line-height:6px;font-size:6px">&nbsp;</td></tr>
<tr><td class="px" style="padding:26px 40px 22px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
<td valign="middle"><a href="${escapeHtml(origin)}" style="text-decoration:none"><img src="${escapeHtml(`${origin}/landing/logo_soundtec.png`)}" width="96" alt="Soundtec" style="display:block;width:96px;height:auto;border:0"></a></td>
<td valign="middle" align="right" style="font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};font-weight:600">Integración audiovisual</td>
</tr></table></td></tr>
<tr><td style="height:1px;background:#f0f1f3;line-height:1px;font-size:1px">&nbsp;</td></tr>
<tr><td style="height:30px;line-height:30px;font-size:1px">&nbsp;</td></tr>
${body}
<tr><td style="height:14px;line-height:14px;font-size:1px">&nbsp;</td></tr>
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px"><tr><td class="px" style="padding:22px 40px 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:#8a94a6;text-align:center">
<p style="margin:0 0 6px;color:#64748b;font-weight:600">${escapeHtml(footer.company)}</p>
${footer.address.trim() ? `<p style="margin:0 0 10px">${escapeHtml(footer.address)}</p>` : ""}
${footer.reason.trim() ? `<p style="margin:0 0 10px">${escapeHtml(footer.reason)}</p>` : ""}
<p style="margin:0">Si no querés recibir más estos mails, <a href="${unsubscribe}" style="color:#64748b;text-decoration:underline">date de baja acá</a>.</p>
</td></tr></table>
</td></tr></table></body></html>`;

  const text = [
    preheader,
    plainText(input.blocks, contact, origin),
    "—",
    [footer.company, footer.address].filter((v) => v.trim()).join(" · "),
    footer.reason,
    `Para no recibir más estos mails: ${input.unsubscribeUrl}`,
  ]
    .filter((v) => v && v.trim())
    .join("\n\n");

  return { subject, html, text };
}
