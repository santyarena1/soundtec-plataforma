import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import sharp from "sharp";
import { blobAccess, isBlobConfigured, servedFilePath } from "@/lib/blob-storage";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
/** Por encima de este valor (0-255) un canal cuenta como blanco puro: limpia el ruido del JPG. */
const WHITE_FLOOR = 244;

/** Lee el logo: solo archivos de formularios del almacenamiento propio o imágenes del mismo sitio. */
async function readLogo(src: string, req: NextRequest): Promise<Buffer | null> {
  const stored = servedFilePath(src);
  if (stored) {
    if (!stored.startsWith("forms/") || !isBlobConfigured()) return null;
    const result = await get(stored, { access: blobAccess() });
    if (!result?.stream) return null;
    return Buffer.from(await new Response(result.stream as ReadableStream).arrayBuffer());
  }
  if (!src.startsWith("/") || src.startsWith("//") || src.startsWith("/api/")) return null;
  const res = await fetch(new URL(src, req.url));
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * «Color a transparencia» del blanco: cada píxel conserva su color real y el
 * blanco que tenía mezclado pasa a ser transparencia (los bordes suaves quedan
 * suaves, sin halo). Si el logo ya trae transparencia, se deja como está.
 */
async function knockOutWhite(input: Buffer, onDark: boolean): Promise<Buffer | null> {
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

/** Si no se puede limpiar, el original (solo rutas propias: nada de redirigir a otros sitios). */
function fallback(src: string, req: NextRequest): NextResponse {
  const own = servedFilePath(src) != null || (src.startsWith("/") && !src.startsWith("//"));
  return own ? NextResponse.redirect(new URL(src, req.url), 302) : new NextResponse("Imagen no disponible.", { status: 404 });
}

/** Logo del formulario sin el fondo blanco (para que no se vea la caja sobre fondos de color). */
export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("u") ?? "";
  if (!src || src.length > 2000) return new NextResponse("Falta la imagen.", { status: 400 });
  try {
    const original = await readLogo(src, req);
    if (!original || original.length > MAX_BYTES) return fallback(src, req);
    const clean = await knockOutWhite(original, req.nextUrl.searchParams.get("fondo") === "oscuro");
    // Ya tenía transparencia: se usa el original.
    if (!clean) return fallback(src, req);
    return new NextResponse(new Uint8Array(clean), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[forms] No se pudo limpiar el logo", error);
    return fallback(src, req);
  }
}
