import * as cheerio from "cheerio";
import { sanitizeEmailHtml } from "@/lib/mailing/html-template";

/**
 * HTML de un mail recibido, listo para mostrarse en el iframe aislado del visor.
 *
 * Capas (cualquiera sola ya alcanza para lo más grave):
 *  1. sanitizeEmailHtml: sin scripts, iframes, handlers on*, javascript:, etc.
 *  2. Acá: fuera formularios enteros, <link>, <meta>, <base>, @import; imágenes
 *     y fondos remotos bloqueados salvo que se pida «Mostrar imágenes»; cid: →
 *     data: (las imágenes adjuntas al propio mail); enlaces a pestaña nueva.
 *  3. La respuesta va con CSP (sin scripts, sin conexiones, sin formularios) y
 *     el iframe con sandbox sin allow-scripts ni allow-same-origin.
 */

export const BLOCKED_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#eef0f3"/></svg>');

const REMOTE = /^\s*(https?:)?\/\//i;
const CSS_URL = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

export type ViewerHtmlOptions = {
  allowRemoteImages: boolean;
  /** cid (sin <>) → data: URI de la imagen adjunta. */
  inlineImages?: Map<string, string>;
};

function normalizeCid(value: string): string {
  return value.replace(/^cid:/i, "").replace(/^<|>$/g, "").trim().toLowerCase();
}

function rewriteCss(css: string, options: ViewerHtmlOptions, onBlocked: () => void): string {
  const withoutImports = css.replace(/@import[^;]*;?/gi, "");
  return withoutImports.replace(CSS_URL, (match, _q: string, url: string) => {
    if (/^cid:/i.test(url)) {
      const data = options.inlineImages?.get(normalizeCid(url));
      return data ? `url("${data}")` : "none";
    }
    if (/^data:image\//i.test(url)) return match;
    if (REMOTE.test(url)) {
      if (options.allowRemoteImages && /^\s*https?:/i.test(url)) return match;
      onBlocked();
      return "none";
    }
    return "none";
  });
}

export function prepareViewerHtml(rawHtml: string, options: ViewerHtmlOptions): { html: string; blockedImages: number } {
  let blocked = 0;
  const onBlocked = () => {
    blocked += 1;
  };
  const $ = cheerio.load(sanitizeEmailHtml(rawHtml));
  // Lo que sanitizeEmailHtml deja para plantillas propias pero acá sobra.
  $("form, link, meta, base, script, iframe, object, embed").remove();

  $("img").each((_, el) => {
    const node = $(el);
    node.removeAttr("srcset");
    const src = node.attr("src") ?? "";
    if (/^cid:/i.test(src)) {
      const data = options.inlineImages?.get(normalizeCid(src));
      if (data) node.attr("src", data);
      else node.attr("src", BLOCKED_IMAGE_PLACEHOLDER);
      return;
    }
    if (/^data:image\//i.test(src)) return;
    if (REMOTE.test(src)) {
      if (options.allowRemoteImages && /^\s*https?:/i.test(src)) return;
      blocked += 1;
      node.attr("data-blocked-src", "1");
      node.attr("src", BLOCKED_IMAGE_PLACEHOLDER);
      return;
    }
    node.removeAttr("src");
  });

  $("[background]").each((_, el) => {
    const value = $(el).attr("background") ?? "";
    if (options.allowRemoteImages && /^\s*https?:/i.test(value)) return;
    if (REMOTE.test(value)) blocked += 1;
    $(el).removeAttr("background");
  });

  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    if (/url\(|@import/i.test(style)) $(el).attr("style", rewriteCss(style, options, onBlocked));
  });
  $("style").each((_, el) => {
    const css = $(el).html() ?? "";
    if (/url\(|@import/i.test(css)) $(el).text(rewriteCss(css, options, onBlocked));
  });

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      $(el).attr("target", "_blank");
      $(el).attr("rel", "noopener noreferrer nofollow");
    } else if (!href.startsWith("#")) {
      $(el).removeAttr("href");
    }
  });

  const head = $("head");
  const baseStyle = "<style>html,body{margin:0;padding:12px;background:#fff;color:#111;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.45;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style>";
  const charset = '<meta charset="utf-8">';
  if (head.length) head.prepend(charset + baseStyle);
  else $.root().prepend(`<head>${charset}${baseStyle}</head>`);
  return { html: $.html(), blockedImages: blocked };
}

/** Texto plano del mail como HTML seguro (para mensajes sin parte HTML). */
export function textToViewerHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linked = escaped.replace(/\bhttps?:\/\/[^\s<>"']+/g, (url) => `<a href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#111;background:#fff}pre{white-space:pre-wrap;word-wrap:break-word;margin:0}</style></head><body><pre>${linked}</pre></body></html>`;
}

/**
 * Política de seguridad de la respuesta del cuerpo: sin scripts, sin
 * conexiones, sin formularios; imágenes remotas solo si se pidieron.
 */
export function viewerCsp(allowRemoteImages: boolean): string {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src data:${allowRemoteImages ? " https: http:" : ""}`,
    "font-src data:",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
    "sandbox allow-popups allow-popups-to-escape-sandbox",
  ].join("; ");
}
