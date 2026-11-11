import { NextRequest, NextResponse } from "next/server";
import sharp, { type OverlayOptions } from "sharp";
import { MAX_BYTES, knockOutWhite, readLogo } from "@/lib/forms/logo-image";
import { networkSvg } from "@/lib/forms/network-art";

export const runtime = "nodejs";

/** Imagen al doble de tamaño (se muestra a 600 × 190 en el mail: nítida en pantallas retina). */
const WIDTH = 1200;
const HEIGHT = 380;
const SOUNDTEC_LOGO = "/landing/logo_soundtec.png";

/** Encabezado del mail de invitación: red de puntos con el logo del evento (o el de Soundtec) al centro. */
export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("u") || SOUNDTEC_LOGO;
  if (src.length > 2000) return new NextResponse("Imagen inválida.", { status: 400 });
  try {
    const background = sharp(Buffer.from(networkSvg({ width: WIDTH, height: HEIGHT, points: 58, seed: src })));
    const original = await readLogo(src, req.url);
    const layers: OverlayOptions[] = [];
    if (original && original.length <= MAX_BYTES) {
      const logo = (await knockOutWhite(original, false)) ?? original;
      const fitted = await sharp(logo).resize({ width: 700, height: 190, fit: "inside", withoutEnlargement: false }).png().toBuffer();
      layers.push({ input: fitted, gravity: "center" });
    }
    const png = await background.composite(layers).png({ compressionLevel: 9 }).toBuffer();
    return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (error) {
    console.error("[forms] No se pudo armar el encabezado del mail", error);
    return new NextResponse("No se pudo armar la imagen.", { status: 500 });
  }
}
