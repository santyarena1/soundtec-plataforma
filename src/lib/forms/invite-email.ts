import type { InfoItem } from "@/lib/forms/types";

/**
 * Mail de invitación con la estética de los formularios: encabezado con la red
 * de puntos y el logo del evento, título grande, datos del evento y un botón
 * bien visible. Hecho con tablas y estilos en línea para que se vea igual en
 * Gmail, Outlook y el celular. Sin dependencias de servidor: también arma la
 * vista previa del panel.
 */

export const DEFAULT_INVITE_MESSAGE =
  "Hola {nombre},\n\nTe invitamos a nuestro próximo evento. Confirmá tu asistencia desde el botón: te lleva a un formulario corto.\n\n¡Te esperamos!";

/** Inter (la del sitio) donde el programa de mail la carga (Apple Mail, iOS); si no, la mejor del sistema: Segoe UI en Windows, Roboto en Android, Helvetica en Mac. Nunca Arial en negrita extra. */
const FONT = "Inter,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

const ACCENTS = { black: "#0a0a0a", blue: "#1e3553" } as const;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function fillPlaceholders(text: string, invite: { name?: string | null; company?: string | null }): string {
  const first = (invite.name ?? "").split(" ")[0] ?? "";
  return text
    .replace(/\{nombre\}/gi, first)
    .replace(/\{empresa\}/gi, invite.company ?? "")
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/Hola\s*,/gi, "Hola,");
}

export type InviteEmailInput = {
  formTitle: string;
  /** Título grande del mail (el de la bienvenida del formulario o su nombre). */
  eventTitle?: string;
  subject?: string;
  message?: string;
  button?: string;
  url: string;
  /** Imagen del encabezado (red de puntos + logo), URL absoluta. */
  headerUrl?: string | null;
  /** Datos del evento (los de «Información útil» de la confirmación). */
  details?: InfoItem[];
  accent?: "black" | "blue";
  invite: { name?: string | null; company?: string | null };
  reminder?: boolean;
};

function detailsTable(details: InfoItem[]): string {
  const rows = details.filter((d) => d.label.trim() && d.value.trim()).slice(0, 6);
  if (!rows.length) return "";
  const cells = rows.map(
    (d) =>
      `<td valign="top" width="50%" style="padding:14px 12px 14px 0"><p style="margin:0;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:600">${escapeHtml(d.label)}</p><p style="margin:5px 0 0;font-family:${FONT};font-size:15px;line-height:1.4;color:#0f172a;font-weight:600">${escapeHtml(d.value).replace(/\n/g, "<br>")}</p></td>`
  );
  const pairs: string[] = [];
  for (let i = 0; i < cells.length; i += 2) pairs.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td width="50%"></td>'}</tr>`);
  return `<tr><td style="padding:8px 40px 4px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">${pairs.join("")}</table></td></tr>`;
}

export function renderInviteEmail(input: InviteEmailInput): { subject: string; html: string; text: string } {
  const baseSubject = fillPlaceholders(input.subject?.trim() || input.formTitle, input.invite);
  const subject = input.reminder ? `Recordatorio: ${baseSubject}` : baseSubject;
  const message = fillPlaceholders(input.message?.trim() || DEFAULT_INVITE_MESSAGE, input.invite);
  const button = input.button?.trim() || "Confirmar asistencia";
  const title = input.eventTitle?.trim() || input.formTitle;
  const accent = ACCENTS[input.accent ?? "black"];
  const preheader = message.replace(/\s+/g, " ").slice(0, 120);
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:#334155">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const header = input.headerUrl
    ? `<tr><td style="padding:0"><img src="${escapeHtml(input.headerUrl)}" width="600" alt="${escapeHtml(title)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>`
    : "";

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef0f3;font-family:${FONT};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef0f3;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">
${header}
<tr><td style="padding:34px 40px 6px">
<p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#64748b;font-weight:600">${input.reminder ? "Recordatorio" : "Invitación"}</p>
<h1 style="margin:10px 0 22px;font-family:${FONT};font-size:28px;line-height:1.2;color:#0f172a;font-weight:700;letter-spacing:-0.3px">${escapeHtml(title)}</h1>
${paragraphs}
</td></tr>
${detailsTable(input.details ?? [])}
<tr><td style="padding:26px 40px 10px">
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:${accent};border-radius:12px">
<a href="${escapeHtml(input.url)}" style="display:inline-block;padding:16px 30px;font-family:${FONT};font-size:16px;font-weight:600;letter-spacing:0.2px;color:#ffffff;text-decoration:none;border-radius:12px">${escapeHtml(button)} &rarr;</a>
</td></tr></table>
<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#9ca3af">Si el botón no funciona, copiá este enlace en el navegador:<br><a href="${escapeHtml(input.url)}" style="color:#6b7280;word-break:break-all">${escapeHtml(input.url)}</a></p>
</td></tr>
<tr><td style="padding:26px 40px 30px"><p style="margin:0;padding-top:18px;border-top:1px solid #f0f1f3;font-size:12px;line-height:1.5;color:#9ca3af">Es tu enlace personal: no lo reenvíes. Si ya confirmaste, al abrirlo ves la información del evento.</p></td></tr>
</table>
<p style="margin:18px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af">Soundtec · Integración audiovisual</p>
</td></tr></table></body></html>`;

  const detailText = (input.details ?? [])
    .filter((d) => d.label.trim() && d.value.trim())
    .map((d) => `${d.label}: ${d.value}`)
    .join("\n");
  const text = `${title}\n\n${message}${detailText ? `\n\n${detailText}` : ""}\n\n${button}: ${input.url}\n\nEs tu enlace personal: no lo reenvíes.`;
  return { subject, html, text };
}
