/**
 * Piezas comunes de los mails HTML (invitaciones de formularios y campañas).
 * Inter (la del sitio) donde el programa de mail la carga (Apple Mail, iOS); si
 * no, la mejor del sistema: Segoe UI en Windows, Roboto en Android, Helvetica en Mac.
 */
export const MAIL_FONT = "Inter,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

/** Azul Soundtec (el primary del panel). */
export const SOUNDTEC_BLUE = "#1e3553";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
