/**
 * Formato real de una imagen mirando sus primeros bytes («magic bytes»), sin
 * creerle a la extensión ni al Content-Type del servidor: muchos CDN de
 * fabricantes mandan WebP como .jpg, PNG como application/octet-stream o
 * imágenes sin extensión.
 */
export type ImageFormat = "jpeg" | "png" | "gif" | "webp" | "avif" | "heic" | "tiff" | "bmp" | "ico" | "svg";

function ascii(buf: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...buf.subarray(start, Math.min(end, buf.length)));
}

export function sniffImageFormat(input: Uint8Array): ImageFormat | null {
  const b = input;
  if (b.length < 4) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && ascii(b, 1, 4) === "PNG") return "png";
  if (ascii(b, 0, 4) === "GIF8") return "gif";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "webp";
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)) {
    return "tiff";
  }
  if (b[0] === 0x42 && b[1] === 0x4d && b.length > 26) return "bmp";
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return "ico";
  if (ascii(b, 4, 8) === "ftyp") {
    const brands = ascii(b, 8, Math.min(b.length, 64));
    if (/avif|avis/.test(brands)) return "avif";
    if (/heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(brands)) return "heic";
    return null;
  }
  if (looksLikeSvg(b)) return "svg";
  return null;
}

/** Texto que arranca (después de BOM, espacios, <?xml?>, comentarios y DOCTYPE) con <svg. */
function looksLikeSvg(b: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, 4096)).replace(/^﻿/, "");
  const stripped = head
    .replace(/^\s*<\?xml[\s\S]*?\?>/i, "")
    .replace(/^(\s*<!--[\s\S]*?-->)*/g, "")
    .replace(/^\s*<!DOCTYPE[\s\S]*?>/i, "")
    .replace(/^(\s*<!--[\s\S]*?-->)*/g, "")
    .trimStart();
  return /^<svg[\s>]/i.test(stripped);
}

/** ¿Es una página web? (sitios que devuelven HTML de error o de «hotlink» con status 200). */
export function looksLikeHtml(input: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(input.subarray(0, 512)).trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<head") || head.startsWith("<body");
}

/** Formatos que se pueden guardar tal cual: los muestra cualquier navegador, el PDF y los mails. */
export const PASSTHROUGH_FORMATS: ReadonlySet<ImageFormat> = new Set(["jpeg", "png", "webp"]);

/**
 * Limpia un SVG antes de rasterizarlo: sin scripts, sin foreignObject, sin
 * manejadores on*, sin DOCTYPE/ENTITY (bombas XML) y sin referencias a
 * archivos o sitios externos.
 */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?\s*>/gi, "")
    .replace(/<!ENTITY[\s\S]*?>/gi, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi, (match, _q, dq, sq) => {
      const target = String(dq ?? sq ?? "").trim();
      return target.startsWith("#") || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(target) ? match : "";
    })
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none");
}
