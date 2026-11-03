/**
 * HTML de los textos de un formulario (editor TipTap del panel). Mismo criterio
 * que lib/quote-richtext: lista cerrada de tags, sin atributos salvo la
 * alineación y, acá, los enlaces (solo http, https, mailto y tel; se abren en
 * otra pestaña). Corre igual en el servidor y en el navegador.
 */
const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "h2", "h3", "a"]);
const VOID_TAGS = new Set(["br"]);
const ALIGN = /text-align\s*:\s*(left|right|center|justify)/i;
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:)/i;

function escapeAttr(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function attr(raw: string, name: string): string | null {
  const m = raw.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3] ?? "") : null;
}

export function sanitizeFormHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (full, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase();
      const closing = full.startsWith("</");
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (closing) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
      if (VOID_TAGS.has(tag)) return "<br />";
      if (tag === "a") {
        const href = (attr(rawAttrs, "href") ?? "").trim();
        if (!SAFE_HREF.test(href)) return "<a>";
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer nofollow">`;
      }
      const style = attr(rawAttrs, "style");
      const align = style?.match(ALIGN);
      return align ? `<${tag} style="text-align: ${align[1].toLowerCase()}">` : `<${tag}>`;
    });
}

/** Texto plano (para la tabla de respuestas y el Excel). */
export function formHtmlToPlain(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h2|h3)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
