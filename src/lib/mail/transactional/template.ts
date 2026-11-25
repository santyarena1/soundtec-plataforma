/**
 * Plantilla de los mails del portal: la misma estética que las invitaciones
 * de formularios (tarjeta blanca, Inter/Segoe/Roboto, botón azul Soundtec),
 * con tablas y estilos en línea para Gmail, Outlook y el celular. Siempre con
 * versión de texto plano y el pie con los datos de Soundtec. Pura.
 */
import { MAIL_FONT, SOUNDTEC_BLUE, escapeHtml } from "@/lib/mail/html";
import { SOUNDTEC_PHONE, SOUNDTEC_SALES_EMAIL } from "@/lib/company-contact";

export type MailDetail = { label: string; value: string };

export type TransactionalContent = {
  subject: string;
  /** Rótulo chico arriba del título («Acceso al portal», «Aviso interno»). */
  kicker: string;
  title: string;
  paragraphs: string[];
  details?: MailDetail[];
  button?: { label: string; url: string };
  /** Texto chico al final (por qué le llega, qué hacer si no lo pidió). */
  note?: string;
  /** Para avisos internos: sin el pie comercial. */
  internal?: boolean;
};

export type RenderedMail = { subject: string; html: string; text: string };

const FONT = MAIL_FONT;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function detailsHtml(details: MailDetail[]): string {
  const rows = details.filter((d) => d.label.trim() && d.value.trim()).slice(0, 14);
  if (!rows.length) return "";
  const body = rows
    .map(
      (d) =>
        `<tr><td valign="top" style="padding:9px 14px 9px 0;width:34%;font-family:${FONT};font-size:12px;line-height:1.4;color:#64748b;border-bottom:1px solid #f0f1f3">${escapeHtml(d.label)}</td><td valign="top" style="padding:9px 0;font-family:${FONT};font-size:14px;line-height:1.45;color:#0f172a;font-weight:600;border-bottom:1px solid #f0f1f3">${escapeHtml(d.value).replace(/\n/g, "<br>")}</td></tr>`
    )
    .join("");
  return `<tr><td style="padding:6px 40px 4px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e5e7eb">${body}</table></td></tr>`;
}

function footerLines(portalUrl: string): string[] {
  return ["Soundtec · Integración audiovisual", `Tel. ${SOUNDTEC_PHONE} · ${SOUNDTEC_SALES_EMAIL}`, hostOf(portalUrl)];
}

export function renderTransactional(content: TransactionalContent, portalUrl: string): RenderedMail {
  const preheader = content.paragraphs.join(" ").replace(/\s+/g, " ").slice(0, 140);
  const paragraphs = content.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:#334155">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = content.button
    ? `<tr><td style="padding:18px 40px 6px">
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:${SOUNDTEC_BLUE};border-radius:12px">
<a href="${escapeHtml(content.button.url)}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:16px;font-weight:600;letter-spacing:0.2px;color:#ffffff;text-decoration:none;border-radius:12px">${escapeHtml(content.button.label)} &rarr;</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#9ca3af">Si el botón no funciona, copiá este enlace en el navegador:<br><a href="${escapeHtml(content.button.url)}" style="color:#6b7280;word-break:break-all">${escapeHtml(content.button.url)}</a></p>
</td></tr>`
    : "";
  const note = content.note
    ? `<tr><td style="padding:22px 40px 30px"><p style="margin:0;padding-top:16px;border-top:1px solid #f0f1f3;font-size:12px;line-height:1.55;color:#9ca3af">${escapeHtml(content.note).replace(/\n/g, "<br>")}</p></td></tr>`
    : `<tr><td style="padding:0 0 26px"></td></tr>`;
  const footer = content.internal
    ? `<p style="margin:18px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af">Soundtec Portal · aviso automático</p>`
    : footerLines(portalUrl)
        .map((line, i) =>
          i === 0
            ? `<p style="margin:18px 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af">${escapeHtml(line)}</p>`
            : `<p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af">${escapeHtml(line)}</p>`
        )
        .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#eef0f3;font-family:${FONT};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef0f3;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">
<tr><td style="background:${SOUNDTEC_BLUE};padding:18px 40px"><p style="margin:0;font-family:${FONT};font-size:15px;letter-spacing:5px;font-weight:700;color:#ffffff">SOUNDTEC</p></td></tr>
<tr><td style="padding:32px 40px 4px">
<p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#64748b;font-weight:600">${escapeHtml(content.kicker)}</p>
<h1 style="margin:10px 0 20px;font-family:${FONT};font-size:26px;line-height:1.25;color:#0f172a;font-weight:700;letter-spacing:-0.3px">${escapeHtml(content.title)}</h1>
${paragraphs}
</td></tr>
${detailsHtml(content.details ?? [])}
${button}
${note}
</table>
${footer}
</td></tr></table></body></html>`;

  const detailText = (content.details ?? [])
    .filter((d) => d.label.trim() && d.value.trim())
    .map((d) => `${d.label}: ${d.value}`)
    .join("\n");
  const text = [
    content.title,
    content.paragraphs.join("\n\n"),
    detailText,
    content.button ? `${content.button.label}: ${content.button.url}` : "",
    content.note ?? "",
    content.internal ? "Soundtec Portal · aviso automático" : `--\n${footerLines(portalUrl).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject: content.subject, html, text };
}
