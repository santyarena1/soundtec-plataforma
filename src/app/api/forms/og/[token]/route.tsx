import satori from "satori";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { readSettings } from "@/lib/forms/types";
import { MAX_BYTES, knockOutWhite, readLogo } from "@/lib/forms/logo-image";
import { networkSvg } from "@/lib/forms/network-art";

export const runtime = "nodejs";

/** Tamaño estándar de vista previa (WhatsApp, Facebook, LinkedIn, X). */
const WIDTH = 1200;
const HEIGHT = 630;
const SOUNDTEC_LOGO = "/landing/logo_soundtec.png";
/** Datos del evento que se muestran abajo del logo, en este orden de preferencia. */
const DETAIL_LABELS = /^(fecha|d[ií]a|horario|hora|lugar|sal[oó]n|sede)$/i;

/**
 * Tipografía de la imagen, servida por el propio sitio. Se arma con satori (dibujo
 * a vectores) + sharp (a PNG) en lugar de next/og: next/og no encuentra su
 * tipografía interna en Windows y así funciona igual en local y en Vercel.
 */
let fontCache: ArrayBuffer | null = null;
async function loadFont(origin: string): Promise<ArrayBuffer | null> {
  if (fontCache) return fontCache;
  const res = await fetch(new URL("/fonts/noto-sans-regular.ttf", origin)).catch(() => null);
  if (!res?.ok) return null;
  fontCache = await res.arrayBuffer();
  return fontCache;
}

async function pngDataUri(input: Buffer, box: { width: number; height: number }): Promise<{ src: string; width: number; height: number }> {
  const { data, info } = await sharp(input).resize({ ...box, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  return { src: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height };
}

/**
 * Imagen que aparece al compartir el enlace de un formulario: la red de puntos
 * de los formularios, el logo del evento grande al centro y la fecha, el
 * horario y el lugar (los de «Información útil» de la confirmación).
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return new Response("No encontrado.", { status: 404 });
  const form = await prisma.form.findUnique({ where: { token }, select: { title: true, settings: true } });
  if (!form) return new Response("No encontrado.", { status: 404 });
  const settings = readSettings(form.settings);
  const title = settings.welcomeTitle?.trim() || form.title;
  const details = (settings.endInfo ?? [])
    .filter((d) => DETAIL_LABELS.test(d.label.trim()) && d.value.trim())
    .slice(0, 3)
    .map((d) => d.value.trim().replace(/\s+/g, " "));

  const background = await sharp(Buffer.from(networkSvg({ width: WIDTH, height: HEIGHT, points: 72, seed: token, linkDistance: 185 }))).png().toBuffer();
  const customLogo = settings.logoUrl || settings.welcomeImageUrl;
  const rawLogo = await readLogo(customLogo || SOUNDTEC_LOGO, req.url).catch(() => null);
  let logo: { src: string; width: number; height: number } | null = null;
  if (rawLogo && rawLogo.length <= MAX_BYTES) {
    const clean = (await knockOutWhite(rawLogo, false).catch(() => null)) ?? rawLogo;
    logo = await pngDataUri(clean, customLogo ? { width: 820, height: 250 } : { width: 260, height: 150 });
  }

  const font = await loadFont(req.url);
  if (!font) return new Response("Falta la tipografía.", { status: 500 });
  const svg = await satori(
    (
      // El fondo va como backgroundImage: satori pinta lo posicionado en absoluto por encima del resto.
      <div style={{ width: WIDTH, height: HEIGHT, display: "flex", fontFamily: "Noto Sans", backgroundImage: `url(data:image/png;base64,${background.toString("base64")})`, backgroundSize: `${WIDTH}px ${HEIGHT}px` }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", padding: "56px 80px" }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo.src} width={logo.width} height={logo.height} alt="" />
          ) : null}
          {/* Con logo propio el nombre ya está en la imagen: abajo van los datos. Sin logo, el título grande. */}
          {!customLogo ? <div style={{ display: "flex", marginTop: 36, fontSize: 72, color: "#0a0a0a", letterSpacing: -2, textAlign: "center" }}>{title}</div> : null}
          {details.length ? (
            <div style={{ display: "flex", alignItems: "center", marginTop: customLogo ? 44 : 26, fontSize: 34, color: "#1f2937" }}>
              {details.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 ? <div style={{ display: "flex", width: 10, height: 10, borderRadius: 10, background: "#2f6fd6", margin: "0 22px" }} /> : null}
                  {d}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, fonts: [{ name: "Noto Sans", data: font, weight: 400, style: "normal" }] }
  );
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
