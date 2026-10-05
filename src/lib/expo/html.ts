const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapa texto para insertarlo en HTML (cuerpos de mail). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Texto plano → HTML seguro: primero escapa, después \n → <br>. */
export function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}
