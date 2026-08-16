import DOMPurify from "isomorphic-dompurify";

/**
 * Los cuerpos de los módulos conviven en dos formatos: el texto plano original
 * (párrafos separados por línea en blanco, subtítulos en mayúsculas) y el HTML
 * acotado que produce el editor visual. Se distinguen por el primer tag, así no
 * hace falta migrar nada ni agregar una columna.
 *
 * El set de tags es cerrado a propósito: todo lo que se pueda escribir acá tiene
 * que sobrevivir igual en pantalla, en el PDF y en el export a Word, y Word sólo
 * renderiza bien un subconjunto chico de HTML.
 */
const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "h3"];
const ALLOWED_ATTR = ["style"];

export function isRichText(body: string) {
  return /^\s*<(p|ul|ol|h3)[\s>]/i.test(body);
}

export function sanitizeQuoteHtml(html: string) {
  try {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
  } catch {
    return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  }
}

export function splitParagraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

/** En la COT Word los subtítulos de cada módulo van en mayúsculas y solos en su línea. */
export function isHeadingLine(line: string) {
  return line.length <= 60 && line === line.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(line);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Abre un texto plano heredado en el editor sin perder los subtítulos. */
export function plainToHtml(body: string) {
  return splitParagraphs(body)
    .map((chunk) => {
      const [first, ...rest] = chunk.split("\n");
      const paragraph = (text: string) =>
        `<p style="text-align: justify">${escapeHtml(text).replaceAll("\n", "<br />")}</p>`;
      if (isHeadingLine(first) && rest.length > 0) {
        return `<h3>${escapeHtml(first)}</h3>${paragraph(rest.join("\n"))}`;
      }
      return paragraph(chunk);
    })
    .join("");
}

/** Cualquiera sea el formato guardado, el editor siempre recibe HTML. */
export function toEditorHtml(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return "";
  return isRichText(trimmed) ? sanitizeQuoteHtml(trimmed) : plainToHtml(trimmed);
}

/** Para prompts de IA y chequeos que esperan texto corrido. */
export function richTextToPlain(body: string) {
  if (!isRichText(body)) return body;
  return body
    .replace(/<\/(p|h3|li)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
