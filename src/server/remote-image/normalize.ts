/**
 * Deja cualquier foto de producto en un formato que funcione en todos lados
 * (pantallas, PDF de cotización, mails): se valida por contenido real con
 * sharp, no por extensión.
 *  - JPEG / PNG / WebP de tamaño razonable: se guardan tal cual.
 *  - AVIF, GIF (primer cuadro), TIFF, BMP, ICO, SVG (limpio y rasterizado),
 *    HEIC si el runtime lo soporta, o fotos de más de 2000 px / 2 MB:
 *    se convierten. Con transparencia real → PNG (conserva el recorte); si no → JPEG.
 */
import sharp, { type Metadata, type Sharp } from "sharp";
import { PASSTHROUGH_FORMATS, looksLikeHtml, sanitizeSvg, sniffImageFormat, type ImageFormat } from "@/lib/remote-image/sniff";
import { ImageRejectError } from "@/lib/remote-image/reasons";

export const MAX_SIDE = 2000;
const PASSTHROUGH_MAX_BYTES = 2 * 1024 * 1024;
/** Lado mayor mínimo: menos que esto es un ícono, no una foto de producto. */
export const MIN_LONG_SIDE = 120;
const MIN_SHORT_SIDE = 40;
const MAX_INPUT_PIXELS = 80_000_000;
const SVG_RENDER_SIDE = 1600;

export interface NormalizedImage {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
  width: number;
  height: number;
  sourceFormat: ImageFormat;
  converted: boolean;
}

const OUTPUT: Record<"jpeg" | "png" | "webp", { contentType: NormalizedImage["contentType"]; ext: NormalizedImage["ext"] }> = {
  jpeg: { contentType: "image/jpeg", ext: "jpg" },
  png: { contentType: "image/png", ext: "png" },
  webp: { contentType: "image/webp", ext: "webp" },
};

async function rasterizeSvg(input: Buffer): Promise<Buffer> {
  const clean = Buffer.from(sanitizeSvg(input.toString("utf8")), "utf8");
  const meta = await sharp(clean).metadata();
  const longSide = Math.max(meta.width ?? 0, meta.height ?? 0) || 300;
  // Los SVG suelen declarar 100-300 px: se dibujan con más densidad para que la foto no quede chica.
  const density = Math.min(600, Math.max(72, Math.round((72 * SVG_RENDER_SIDE) / longSide)));
  return sharp(clean, { density, limitInputPixels: MAX_INPUT_PIXELS }).png().toBuffer();
}

async function hasRealTransparency(image: Sharp, hasAlpha: boolean | undefined): Promise<boolean> {
  if (!hasAlpha) return false;
  const { channels } = await image.clone().stats();
  return (channels[3]?.min ?? 255) < 250;
}

export async function normalizeProductImage(input: Buffer): Promise<NormalizedImage> {
  if (!input.length) throw new ImageRejectError("empty");
  const format = sniffImageFormat(input);
  if (!format) throw new ImageRejectError(looksLikeHtml(input) ? "not-an-image" : "unsupported-format");

  let source = input;
  if (format === "svg") {
    try {
      source = await rasterizeSvg(input);
    } catch {
      throw new ImageRejectError("decode-failed", "SVG");
    }
  }

  let image: Sharp;
  let meta: Metadata;
  try {
    // animated:false → GIF/WebP animados: solo el primer cuadro.
    image = sharp(source, { animated: false, limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
    meta = await image.metadata();
  } catch (error) {
    if (format === "heic") throw new ImageRejectError("heic-unsupported");
    throw new ImageRejectError("decode-failed", error instanceof Error ? error.message.slice(0, 80) : undefined);
  }
  const orientationSwaps = (meta.orientation ?? 1) >= 5;
  const width = (orientationSwaps ? meta.height : meta.width) ?? 0;
  const height = (orientationSwaps ? meta.width : meta.height) ?? 0;
  if (!width || !height) throw new ImageRejectError("decode-failed");
  if (Math.max(width, height) < MIN_LONG_SIDE || Math.min(width, height) < MIN_SHORT_SIDE) {
    throw new ImageRejectError("too-small", `${width}×${height} px`);
  }

  const keepAsIs =
    PASSTHROUGH_FORMATS.has(format) &&
    input.length <= PASSTHROUGH_MAX_BYTES &&
    Math.max(width, height) <= MAX_SIDE &&
    (meta.orientation ?? 1) === 1 &&
    !meta.pages; // WebP animado → se convierte al primer cuadro
  if (keepAsIs) {
    const out = OUTPUT[format as "jpeg" | "png" | "webp"];
    return { bytes: input, ...out, width, height, sourceFormat: format, converted: false };
  }

  try {
    const transparent = await hasRealTransparency(image, meta.hasAlpha);
    const pipeline = image
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb");
    const { data, info } = transparent
      ? await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true })
      : await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer({ resolveWithObject: true });
    const out = OUTPUT[transparent ? "png" : "jpeg"];
    return { bytes: data, ...out, width: info.width, height: info.height, sourceFormat: format, converted: true };
  } catch (error) {
    if (format === "heic") throw new ImageRejectError("heic-unsupported");
    throw new ImageRejectError("decode-failed", error instanceof Error ? error.message.slice(0, 80) : undefined);
  }
}
