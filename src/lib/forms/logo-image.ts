import { get } from "@vercel/blob";
import sharp from "sharp";
import { blobAccess, isBlobConfigured, servedFilePath } from "@/lib/blob-storage";

export const MAX_BYTES = 8 * 1024 * 1024;
/** Por encima de este valor (0-255) un canal cuenta como blanco puro: limpia el ruido del JPG. */
const WHITE_FLOOR = 244;

/** Lee el logo: solo archivos de formularios del almacenamiento propio o imágenes del mismo sitio. */
export async function readLogo(src: string, origin: string): Promise<Buffer | null> {
  const stored = servedFilePath(src);
  if (stored) {
    if (!stored.startsWith("forms/") || !isBlobConfigured()) return null;
    const result = await get(stored, { access: blobAccess() });
    if (!result?.stream) return null;
    return Buffer.from(await new Response(result.stream as ReadableStream).arrayBuffer());
  }
  if (!src.startsWith("/") || src.startsWith("//") || src.startsWith("/api/")) return null;
  const res = await fetch(new URL(src, origin));
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * «Color a transparencia» del blanco: cada píxel conserva su color real y el
 * blanco que tenía mezclado pasa a ser transparencia (los bordes suaves quedan
 * suaves, sin halo). Si el logo ya trae transparencia, se deja como está.
 */
export async function knockOutWhite(input: Buffer, onDark: boolean): Promise<Buffer | null> {
  const image = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
  const meta = await image.metadata();
  if (meta.hasAlpha) {
    const { channels } = await image.stats();
    if ((channels[3]?.min ?? 255) < 250) return null;
  }
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const c = [data[i], data[i + 1], data[i + 2]].map((v) => (v >= WHITE_FLOOR ? 255 : v));
    const alpha = Math.max(...c.map((v) => (255 - v) / 255));
    if (alpha <= 0) continue;
    for (let k = 0; k < 3; k++) out[i + k] = Math.round(Math.min(255, Math.max(0, (c[k] - 255 * (1 - alpha)) / alpha)));
    out[i + 3] = Math.round(alpha * (data[i + 3] ?? 255));
  }
  if (onDark && isMonochrome(out)) {
    // Logo en blanco y negro sobre fondo oscuro: se pasa a blanco para que se lea sin recuadro.
    for (let i = 0; i < out.length; i += 4) out[i] = out[i + 1] = out[i + 2] = 255;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).trim().png({ compressionLevel: 9 }).toBuffer();
}

/** Sin color propio (negro, grises): la diferencia entre canales de los píxeles visibles es mínima. */
function isMonochrome(rgba: Buffer): boolean {
  let visible = 0;
  let colorful = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 64) continue;
    visible += 1;
    if (Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) - Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) > 40) colorful += 1;
  }
  return visible > 0 && colorful / visible < 0.02;
}

