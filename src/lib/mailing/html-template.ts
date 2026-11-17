import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { unzipSync } from "fflate";

/**
 * Plantillas HTML importadas (newsletters armados afuera): saneo, imágenes a
 * Blob, avisos de entregabilidad y versión en texto plano. Corre en el servidor.
 */

/** Gmail corta el mensaje («[Mensaje recortado]») cuando el HTML pasa los ~102 KB. */
export const GMAIL_CLIP_BYTES = 100 * 1024;
export const MAX_TEMPLATE_BYTES = 600 * 1024;
const MAX_WIDTH_PX = 700;
/** Desde este ancho fijo (sin max-width ni media query que lo pise) el mail no entra en un celular (~360-420 px). */
const FIXED_WIDTH_PX = 480;

const REMOVE_TAGS = ["script", "noscript", "iframe", "frame", "frameset", "object", "embed", "applet", "base", "svg", "math", "template", "portal", "audio", "video", "canvas", "input", "button", "select", "textarea", "option", "datalist", "keygen", "output"];
const DANGEROUS_URL = /^(javascript|vbscript|livescript|data(?!:image\/(png|jpe?g|gif|webp);))/i;
const URL_ATTRS = ["href", "src", "action", "formaction", "background", "poster", "xlink:href", "srcset", "lowsrc", "dynsrc", "longdesc", "cite"];
const DANGEROUS_CSS = /expression\s*\(|javascript\s*:|vbscript\s*:|behavior\s*:|-moz-binding/gi;

function cleanUrl(value: string): string {
  // Los navegadores ignoran espacios y caracteres de control dentro del esquema («java\tscript:»).
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000- \u007f]+/g, "").replace(/&#x?0*(9|a|d|10|13);?/gi, "");
}

/**
 * Saca todo lo que puede ejecutar código o pedir datos: scripts, iframes,
 * formularios, handlers on*, URLs javascript:/vbscript:/data: (salvo imágenes)
 * y CSS con expression(). Deja estilos, tablas, imágenes y comentarios
 * condicionales de Outlook.
 */
export function sanitizeEmailHtml(html: string): string {
  const $ = cheerio.load(html);
  $(REMOVE_TAGS.join(",")).remove();
  $("meta[http-equiv]").each((_, el) => {
    if (/refresh|set-cookie/i.test($(el).attr("http-equiv") ?? "")) $(el).remove();
  });
  $("link").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const ok = /stylesheet/i.test($(el).attr("rel") ?? "") && /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i.test(href);
    if (!ok) $(el).remove();
  });
  // Formularios: se va el <form> pero queda lo que tenía adentro (textos, tablas).
  $("form").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });
  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    for (const name of Object.keys(el.attribs ?? {})) {
      const value = el.attribs[name] ?? "";
      const lower = name.toLowerCase();
      if (lower.startsWith("on") || lower === "formaction" || lower === "srcdoc") {
        $(el).removeAttr(name);
        continue;
      }
      if (URL_ATTRS.includes(lower) && DANGEROUS_URL.test(cleanUrl(value))) {
        $(el).removeAttr(name);
        continue;
      }
      if (lower === "style" && DANGEROUS_CSS.test(value)) $(el).attr(name, value.replace(DANGEROUS_CSS, ""));
      DANGEROUS_CSS.lastIndex = 0;
    }
  });
  $("style").each((_, el) => {
    const css = $(el).html() ?? "";
    if (DANGEROUS_CSS.test(css)) $(el).text(css.replace(DANGEROUS_CSS, ""));
    DANGEROUS_CSS.lastIndex = 0;
  });
  // Comentarios con algo ejecutable adentro (los condicionales de Outlook comunes se dejan).
  $("*")
    .contents()
    .each((_, node) => {
      if (node.type === "comment" && /<script|javascript:|<iframe|on\w+\s*=/i.test((node as unknown as { data: string }).data)) $(node).remove();
    });
  return $.html();
}

const IMG_CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

/** Todas las direcciones de imágenes del HTML: <img src>, background= y url(...) del CSS. */
export function imageRefs(html: string): string[] {
  const $ = cheerio.load(html);
  const refs = new Set<string>();
  $("img[src]").each((_, el) => void refs.add(($(el).attr("src") ?? "").trim()));
  $("[background]").each((_, el) => void refs.add(($(el).attr("background") ?? "").trim()));
  const css = [$("style").text(), ...$("[style]").map((_, el) => $(el).attr("style") ?? "").get()].join("\n");
  for (const m of css.matchAll(IMG_CSS_URL)) refs.add(m[2]!.trim());
  return [...refs].filter(Boolean);
}

/** Reemplaza las direcciones de imágenes según el mapa (las que no están quedan igual). */
export function rewriteImageRefs(html: string, map: Map<string, string>): string {
  if (!map.size) return html;
  const $ = cheerio.load(html);
  const swap = (value: string | undefined) => (value ? (map.get(value.trim()) ?? value) : value);
  $("img[src]").each((_, el) => void $(el).attr("src", swap($(el).attr("src"))));
  $("[background]").each((_, el) => void $(el).attr("background", swap($(el).attr("background"))));
  const fixCss = (css: string) => css.replace(IMG_CSS_URL, (whole, quote: string, url: string) => (map.has(url.trim()) ? `url(${quote}${map.get(url.trim())}${quote})` : whole));
  $("[style]").each((_, el) => void $(el).attr("style", fixCss($(el).attr("style") ?? "")));
  $("style").each((_, el) => void $(el).text(fixCss($(el).html() ?? "")));
  return $.html();
}

export type IncomingFile = { path: string; bytes: Uint8Array };

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

export function imageTypeOf(path: string): string | null {
  return IMAGE_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const part of p.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/").toLowerCase();
}

/** Busca el archivo de una ruta relativa del HTML dentro del zip (sin importar mayúsculas ni «./»). */
export function resolveZipPath(ref: string, htmlPath: string, files: IncomingFile[]): IncomingFile | null {
  let clean = ref.split(/[?#]/)[0] ?? "";
  try {
    clean = decodeURIComponent(clean);
  } catch {
    /* ruta con % suelto */
  }
  const dir = htmlPath.includes("/") ? htmlPath.slice(0, htmlPath.lastIndexOf("/") + 1) : "";
  const candidates = [normalizePath(dir + clean), normalizePath(clean)];
  const byPath = new Map(files.map((f) => [normalizePath(f.path), f]));
  for (const c of candidates) {
    const hit = byPath.get(c);
    if (hit) return hit;
  }
  // Último intento: mismo nombre de archivo en cualquier carpeta (si es único).
  const name = clean.split("/").pop()?.toLowerCase();
  const same = files.filter((f) => f.path.split("/").pop()?.toLowerCase() === name);
  return same.length === 1 ? same[0]! : null;
}

export const MAX_ZIP_BYTES = 20 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Abre el .zip (con tope de tamaño descomprimido) y elige el HTML: index.html o el más grande. */
export function readTemplateZip(bytes: Uint8Array): { htmlPath: string; html: string; files: IncomingFile[] } {
  let total = 0;
  const entries = unzipSync(bytes, {
    filter: (file) => {
      if (file.name.endsWith("/") || /(^|\/)(__MACOSX|\.)/.test(file.name)) return false;
      const wanted = /\.html?$/i.test(file.name) || Boolean(imageTypeOf(file.name));
      if (!wanted) return false;
      total += file.originalSize;
      if (total > MAX_UNZIPPED_BYTES) throw new Error("El .zip descomprimido pesa demasiado (máximo 60 MB).");
      return true;
    },
  });
  const files = Object.entries(entries).map(([path, data]) => ({ path, bytes: data }));
  const htmls = files.filter((f) => /\.html?$/i.test(f.path));
  if (!htmls.length) throw new Error("El .zip no trae ningún archivo .html.");
  const main = htmls.find((f) => /(^|\/)index\.html?$/i.test(f.path)) ?? htmls.sort((a, b) => b.bytes.length - a.bytes.length)[0]!;
  return { htmlPath: main.path, html: new TextDecoder("utf-8").decode(main.bytes), files: files.filter((f) => f !== main) };
}

export type StoreImage = (bytes: Uint8Array, contentType: string, ext: string) => Promise<string>;

/**
 * Sube a Blob las imágenes que no tienen URL absoluta: las del .zip (por su
 * ruta relativa) y las incrustadas en base64. Devuelve el HTML con las URLs
 * nuevas y las que no se pudieron resolver.
 */
export async function hostImages(html: string, options: { files?: IncomingFile[]; htmlPath?: string; store: StoreImage }): Promise<{ html: string; uploaded: number; missing: string[] }> {
  const map = new Map<string, string>();
  const missing: string[] = [];
  const byFile = new Map<IncomingFile, string>();
  for (const ref of imageRefs(html)) {
    if (/^https?:\/\//i.test(ref) || /^cid:/i.test(ref) || ref.startsWith("{{")) continue;
    const data = ref.match(/^data:(image\/(png|jpe?g|gif|webp));base64,(.+)$/i);
    if (data) {
      const bytes = Uint8Array.from(Buffer.from(data[3]!.replace(/\s+/g, ""), "base64"));
      if (bytes.length > MAX_IMAGE_BYTES) {
        missing.push("imagen incrustada de más de 5 MB");
        continue;
      }
      const type = data[1]!.toLowerCase().replace("jpg", "jpeg");
      map.set(ref, await options.store(bytes, type, type.split("/")[1]!.replace("jpeg", "jpg")));
      continue;
    }
    if (ref.startsWith("//")) {
      map.set(ref, `https:${ref}`);
      continue;
    }
    const file = options.files ? resolveZipPath(ref, options.htmlPath ?? "", options.files) : null;
    const type = file ? imageTypeOf(file.path) : null;
    if (!file || !type || file.bytes.length > MAX_IMAGE_BYTES) {
      missing.push(ref);
      continue;
    }
    let url = byFile.get(file);
    if (!url) {
      url = await options.store(file.bytes, type, file.path.split(".").pop()!.toLowerCase());
      byFile.set(file, url);
    }
    map.set(ref, url);
  }
  return { html: rewriteImageRefs(html, map), uploaded: new Set(map.values()).size, missing };
}

export type TemplateWarning = { code: "size" | "relative_image" | "http_link" | "http_image" | "missing_alt" | "wide" | "not_responsive" | "no_unsubscribe" | "removed"; message: string };

/** Avisos de entregabilidad (no bloquean el guardado). */
export function analyzeEmailHtml(html: string, options: { removedSomething?: boolean } = {}): TemplateWarning[] {
  const warnings: TemplateWarning[] = [];
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > GMAIL_CLIP_BYTES) warnings.push({ code: "size", message: `Pesa ${Math.round(bytes / 1024)} KB: Gmail corta los mails de más de 100 KB («Mensaje recortado») y esconde el pie con la baja.` });
  const $ = cheerio.load(html);
  const refs = imageRefs(html);
  const relative = refs.filter((r) => !/^https?:\/\//i.test(r) && !r.startsWith("{{"));
  if (relative.length) warnings.push({ code: "relative_image", message: `${relative.length} imagen(es) sin dirección absoluta (no se van a ver): ${relative.slice(0, 3).join(", ")}${relative.length > 3 ? "…" : ""}` });
  const httpImages = refs.filter((r) => /^http:\/\//i.test(r));
  if (httpImages.length) warnings.push({ code: "http_image", message: `${httpImages.length} imagen(es) por http:// (sin s): Gmail y Outlook las pueden bloquear.` });
  const httpLinks = $("a[href]").filter((_, el) => /^http:\/\//i.test(($(el).attr("href") ?? "").trim())).length;
  if (httpLinks) warnings.push({ code: "http_link", message: `${httpLinks} enlace(s) con http:// (sin s): los filtros de spam lo miran mal. Cambialos a https://.` });
  const noAlt = $("img").filter((_, el) => $(el).attr("alt") === undefined).length;
  if (noAlt) warnings.push({ code: "missing_alt", message: `${noAlt} imagen(es) sin texto alternativo (alt): si el programa de mail bloquea las imágenes, no se entiende nada.` });
  const wide = $("table,td,img,div")
    .toArray()
    .some((el: AnyNode) => {
      if (el.type !== "tag") return false;
      const attrWidth = Number((el.attribs.width ?? "").replace(/px$/i, ""));
      const style = el.attribs.style ?? "";
      const cssWidth = style.match(/(?:^|;|\s)width\s*:\s*(\d+)px/i);
      return attrWidth > MAX_WIDTH_PX || Number(cssWidth?.[1] ?? 0) > MAX_WIDTH_PX;
    });
  if (wide) warnings.push({ code: "wide", message: `Tiene partes de más de ${MAX_WIDTH_PX} px de ancho: en el celular y en Outlook se corta o aparece una barra horizontal. Lo habitual es 600 px.` });
  else {
    const fixed = fixedWidthPx($);
    if (fixed) warnings.push({ code: "not_responsive", message: `Tiene un ancho fijo de ${fixed} px sin max-width: no se adapta al celular (se ve achicado o con barra horizontal). Agregale style="width:100%;max-width:${fixed}px" a la tabla principal.` });
  }
  if (!/\{\{\s*baja\s*\}\}/i.test(html)) warnings.push({ code: "no_unsubscribe", message: "No trae {{baja}}: se agrega al final el pie legal con el enlace de baja." });
  if (options.removedSomething) warnings.push({ code: "removed", message: "Se sacaron partes que no se pueden mandar por mail (scripts, formularios, iframes o código en enlaces)." });
  return warnings;
}

/**
 * Ancho fijo (480-700 px) de una tabla o caja que no se achica en el celular:
 * sin max-width, sin ancho en % en el style y sin una media query que la nombre
 * por clase o id. Devuelve el mayor, o null si todo se adapta.
 */
function fixedWidthPx($: cheerio.CheerioAPI): number | null {
  const media = ($("style").text().match(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi) ?? []).join("\n");
  let found = 0;
  $("table,div,td").each((_, el) => {
    if (el.type !== "tag") return;
    const style = el.attribs.style ?? "";
    if (/max-width\s*:/i.test(style) || /(?:^|;|\s)width\s*:\s*\d+(\.\d+)?%/i.test(style)) return;
    const attrWidth = Number((el.attribs.width ?? "").replace(/px$/i, "")) || 0;
    const cssWidth = Number(style.match(/(?:^|;|\s)width\s*:\s*(\d+)px/i)?.[1] ?? 0);
    const width = Math.max(attrWidth, cssWidth);
    if (width < FIXED_WIDTH_PX || width > MAX_WIDTH_PX) return;
    const names = [...(el.attribs.class ?? "").split(/\s+/).filter(Boolean).map((c) => `.${c}`), ...(el.attribs.id ? [`#${el.attribs.id}`] : [])];
    if (names.some((n) => media.includes(n))) return;
    found = Math.max(found, width);
  });
  return found || null;
}

const BLOCKS = new Set(["p", "div", "tr", "table", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "blockquote", "section", "article", "header", "footer", "center"]);

/** Versión en texto plano (la piden los filtros de spam y la muestran algunos relojes y lectores). */
export function htmlToPlainText(html: string): string {
  const $ = cheerio.load(html);
  $("head, style, script, title").remove();
  $("[style]").each((_, el) => {
    if (/display\s*:\s*none/i.test($(el).attr("style") ?? "")) $(el).remove();
  });
  $("br").replaceWith("\n");
  $("img").each((_, el) => void $(el).replaceWith(""));
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const show = /^https?:\/\//i.test(href) || href.startsWith("{{") ? href : "";
    $(el).replaceWith(show && show !== text ? (text ? `${text} (${show})` : show) : text);
  });
  $("*").each((_, el) => {
    if (el.type === "tag" && BLOCKS.has(el.name)) {
      $(el).prepend("\n");
      $(el).append("\n");
    }
  });
  $("td, th").each((_, el) => void $(el).append(" "));
  return $("body")
    .text()
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
