import { MAIL_FONT, escapeHtml } from "@/lib/mail/html";
import type { CampaignFooter } from "@/lib/mailing/template";
import { fillVariables, type MailContact } from "@/lib/mailing/variables";

/**
 * Última mano a un HTML propio (plantilla importada) antes de mandarlo a cada
 * persona: variables, texto de vista previa oculto y enlace de baja. Puro y sin
 * dependencias de servidor: arma también la vista previa del panel.
 *
 * {{baja}} ubica el enlace de baja donde quiera el diseño: dentro de un href
 * («<a href="{{baja}}">») se reemplaza por la dirección; suelto, por un enlace
 * «darte de baja». Si la plantilla no lo trae, se agrega el pie legal completo
 * (razón social, dirección, motivo y enlace) al final.
 */

const BAJA_RE = /\{\{\s*baja\s*\}\}/i;
const BAJA_IN_HREF = /(href\s*=\s*)(["'])\s*\{\{\s*baja\s*\}\}\s*\2/gi;
const BAJA_ANY = /\{\{\s*baja\s*\}\}/gi;

export function hasUnsubscribeMarker(html: string): boolean {
  return BAJA_RE.test(html);
}

const MIN_CONTENT_PX = 320;
const MAX_CONTENT_PX = 800;

export type ContentWidth = { px: number; fixed: boolean };

/**
 * Ancho del contenido de la plantilla (la tabla o caja principal, 320-800 px):
 * el mayor width="N", width:Npx o max-width:Npx de un <table> o <div>. `fixed`
 * si esa caja no tiene max-width (no se achica en el celular). Null si el
 * diseño es de ancho libre.
 */
export function contentWidthPx(html: string): ContentWidth | null {
  let best: ContentWidth | null = null;
  for (const [tag] of html.matchAll(/<(?:table|div)\b[^>]*>/gi)) {
    const style = tag.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
    const css = style?.[2] ?? style?.[3] ?? "";
    const max = Number(css.match(/max-width\s*:\s*(\d+)px/i)?.[1] ?? 0);
    const fluid = max > 0 || /(?:^|;|\s)width\s*:\s*\d+(\.\d+)?%/i.test(css);
    const values = [Number(tag.match(/\swidth\s*=\s*["']?(\d+)(?:px)?["']?(?=[\s>/])/i)?.[1] ?? 0), Number(css.match(/(?:^|;|\s)width\s*:\s*(\d+)px/i)?.[1] ?? 0), max];
    for (const v of values) {
      if (v < MIN_CONTENT_PX || v > MAX_CONTENT_PX) continue;
      if (!best || v > best.px || (v === best.px && best.fixed && fluid)) best = { px: v, fixed: !fluid };
    }
  }
  return best;
}

/**
 * Pie legal; con `width` va centrado y del mismo ancho que el contenido: fijo si
 * el diseño es fijo, o hasta ese ancho y achicándose en el celular si es adaptable.
 */
export function legalFooterHtml(footer: CampaignFooter, unsubscribeUrl: string, width?: ContentWidth | null): string {
  const url = escapeHtml(unsubscribeUrl);
  const cell = `<td align="center" style="padding:22px 16px 26px;font-family:${MAIL_FONT};font-size:12px;line-height:1.6;color:#8a94a6;text-align:center">
<p style="margin:0 0 6px;color:#64748b;font-weight:600">${escapeHtml(footer.company)}</p>
${footer.address.trim() ? `<p style="margin:0 0 10px">${escapeHtml(footer.address)}</p>` : ""}
${footer.reason.trim() ? `<p style="margin:0 0 10px">${escapeHtml(footer.reason)}</p>` : ""}
<p style="margin:0">Si no querés recibir más estos mails, <a href="${url}" style="color:#64748b;text-decoration:underline">date de baja acá</a>.</p>
</td>`;
  if (!width) return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef0f3"><tr>${cell}</tr></table>`;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:0 10px">
<table role="presentation" width="${width.px}" cellspacing="0" cellpadding="0" style="${width.fixed ? `width:${width.px}px` : `width:100%;max-width:${width.px}px`};background:#eef0f3"><tr>${cell}</tr></table>
</td></tr></table>`;
}

function preheaderHtml(preheader: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preheader)}${"&#8199;&#847; ".repeat(40)}</div>`;
}

function insertAfterBodyOpen(html: string, fragment: string): string {
  const match = html.match(/<body\b[^>]*>/i);
  if (!match || match.index === undefined) return fragment + html;
  const at = match.index + match[0].length;
  return html.slice(0, at) + fragment + html.slice(at);
}

function insertBeforeBodyClose(html: string, fragment: string): string {
  const at = html.toLowerCase().lastIndexOf("</body>");
  return at < 0 ? html + fragment : html.slice(0, at) + fragment + html.slice(at);
}

export type FinalizeInput = {
  html: string;
  contact: MailContact;
  preheader?: string;
  unsubscribeUrl: string;
  footer: CampaignFooter;
};

export function finalizeCustomHtml(input: FinalizeInput): string {
  const url = escapeHtml(input.unsubscribeUrl);
  const hadMarker = hasUnsubscribeMarker(input.html);
  let html = input.html
    .replace(BAJA_IN_HREF, (_, attr: string, quote: string) => `${attr}${quote}${url}${quote}`)
    .replace(BAJA_ANY, `<a href="${url}" style="color:inherit;text-decoration:underline">darte de baja</a>`);
  html = fillVariables(html, input.contact, { escape: escapeHtml });
  const preheader = input.preheader?.trim() ? fillVariables(input.preheader.trim(), input.contact) : "";
  if (preheader) html = insertAfterBodyOpen(html, preheaderHtml(preheader));
  if (!hadMarker) html = insertBeforeBodyClose(html, legalFooterHtml(input.footer, input.unsubscribeUrl, contentWidthPx(input.html)));
  return html;
}

/** Texto plano final: el texto de la plantilla con variables y la baja (y el pie si la plantilla no lo trae). */
export function finalizeCustomText(input: { text: string; contact: MailContact; preheader?: string; unsubscribeUrl: string; footer: CampaignFooter; hadMarker: boolean }): string {
  const body = fillVariables(input.text.replace(BAJA_ANY, input.unsubscribeUrl), input.contact);
  const parts = [input.preheader?.trim() ? fillVariables(input.preheader.trim(), input.contact) : "", body];
  if (!input.hadMarker) {
    parts.push("—", [input.footer.company, input.footer.address].filter((v) => v.trim()).join(" · "), input.footer.reason, `Para no recibir más estos mails: ${input.unsubscribeUrl}`);
  }
  return parts.filter((p) => p && p.trim()).join("\n\n");
}
