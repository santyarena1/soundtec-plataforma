import { NextRequest, NextResponse } from "next/server";
import sharp, { type OverlayOptions } from "sharp";
import { MAX_BYTES, knockOutWhite, readLogo } from "@/lib/forms/logo-image";

export const runtime = "nodejs";

/** Imagen al doble de tamaño (se muestra a 600 × 190 en el mail: nítida en pantallas retina). */
const WIDTH = 1200;
const HEIGHT = 380;
const POINTS = 58;
const LINK_DISTANCE = 175;
const BLUE = "#2f6fd6";
const SOUNDTEC_LOGO = "/landing/logo_soundtec.png";

/** Azar con semilla: la misma imagen para el mismo logo (así el CDN la cachea y no cambia entre mails). */
function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

/** La misma red de puntos y líneas finas del fondo de los formularios, en azul Soundtec. */
function networkSvg(seed: string): string {
  const rand = seeded(seed);
  const pts = Array.from({ length: POINTS }, () => ({ x: rand() * WIDTH, y: rand() * HEIGHT, r: 2 + rand() * 1.8 }));
  const lines: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y);
      if (d > LINK_DISTANCE) continue;
      lines.push(`<line x1="${pts[i]!.x.toFixed(1)}" y1="${pts[i]!.y.toFixed(1)}" x2="${pts[j]!.x.toFixed(1)}" y2="${pts[j]!.y.toFixed(1)}" stroke="${BLUE}" stroke-opacity="${((1 - d / LINK_DISTANCE) * 0.3).toFixed(3)}" stroke-width="1.6"/>`);
    }
  }
  const dots = pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}" fill="${BLUE}" fill-opacity="0.5"/>`).join("");
  // Un velo blanco al centro para que el logo se lea limpio sobre la red.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
<defs><radialGradient id="veil" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.96"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="100%" height="100%" fill="#ffffff"/>${lines.join("")}${dots}
<ellipse cx="${WIDTH / 2}" cy="${HEIGHT / 2}" rx="${WIDTH * 0.42}" ry="${HEIGHT * 0.52}" fill="url(#veil)"/></svg>`;
}

/** Encabezado del mail de invitación: red de puntos con el logo del evento (o el de Soundtec) al centro. */
export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("u") || SOUNDTEC_LOGO;
  if (src.length > 2000) return new NextResponse("Imagen inválida.", { status: 400 });
  try {
    const background = sharp(Buffer.from(networkSvg(src)));
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
