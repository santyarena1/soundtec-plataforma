import satori from "satori";
import sharp from "sharp";
import { networkSvg } from "@/lib/forms/network-art";
import { knockOutWhite } from "@/lib/forms/logo-image";
import { fetchPublicImage, publicLogoUrl } from "@/server/brand-logo-source";

/**
 * Tarjetas de vista previa (WhatsApp, redes, Slack…) de todo el sitio, con la
 * estética de los formularios: la red de puntos azul de fondo, el logo o la
 * foto como protagonista y la tipografía del sitio (Inter).
 *
 * Se arman con satori (a vectores) y sharp (a PNG) en lugar de next/og: next/og
 * no encuentra su tipografía interna en Windows, y así funciona igual en local
 * y en Vercel.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const BLUE = "#2f6fd6";
export const SOUNDTEC_LOGO_PATH = "/landing/logo_soundtec.png";

export type CardImage = { src: string; width: number; height: number };

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: "normal" };
let fontCache: Font[] | null = null;

/** Inter servida por el propio sitio (/fonts): las funciones de Vercel no tienen tipografías del sistema. */
async function loadFonts(origin: string): Promise<Font[]> {
  if (fontCache) return fontCache;
  const weights = [400, 700, 800] as const;
  const fonts = await Promise.all(
    weights.map(async (weight) => {
      const res = await fetch(new URL(`/fonts/inter-${weight}.woff`, origin));
      if (!res.ok) throw new Error(`No se pudo leer la tipografía ${weight}`);
      return { name: "Inter", data: await res.arrayBuffer(), weight, style: "normal" as const };
    })
  );
  fontCache = fonts;
  return fonts;
}

/** Bytes de una imagen del sitio (ruta propia) o de una URL pública de internet. */
export async function loadImageBytes(url: string | null | undefined, origin: string): Promise<Buffer | null> {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      const res = await fetch(new URL(raw, origin), { signal: AbortSignal.timeout(8000) });
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      return bytes.length <= MAX_IMAGE_BYTES ? bytes : null;
    }
    const external = publicLogoUrl(raw);
    if (!external) return null;
    return (await fetchPublicImage(external, MAX_IMAGE_BYTES))?.bytes ?? null;
  } catch {
    return null;
  }
}

/** Imagen lista para la tarjeta (PNG en data URI), achicada para entrar en la caja. Con `clean`, sin fondo blanco. */
export async function cardImage(bytes: Buffer | null, box: { width: number; height: number }, options?: { clean?: boolean }): Promise<CardImage | null> {
  if (!bytes) return null;
  try {
    const source = options?.clean ? ((await knockOutWhite(bytes, false).catch(() => null)) ?? bytes) : bytes;
    const { data, info } = await sharp(source).rotate().resize({ ...box, fit: "inside", withoutEnlargement: false }).png().toBuffer({ resolveWithObject: true });
    return { src: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

function clip(text: string | undefined | null, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export type HeroCard = {
  kind: "hero";
  /** Línea chica arriba (CATÁLOGO, LISTA DE PRECIOS…). */
  eyebrow?: string;
  logo?: CardImage | null;
  title?: string;
  subtitle?: string;
  /** Datos sueltos separados por puntos azules (fecha, horario, lugar). */
  details?: string[];
  /** Fila de logos chicos abajo (marcas). */
  strip?: CardImage[];
};

export type ProductCard = {
  kind: "product";
  photo?: CardImage | null;
  brandLogo?: CardImage | null;
  brandName?: string;
  title: string;
  subtitle?: string;
  /** Soundtec chico en la esquina. */
  mark?: CardImage | null;
};

function Hero({ card }: { card: HeroCard }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", padding: "48px 80px" }}>
      {card.eyebrow ? <div style={{ display: "flex", fontSize: 22, fontWeight: 700, letterSpacing: 6, color: "#6b7280", marginBottom: 22 }}>{card.eyebrow.toUpperCase()}</div> : null}
      {card.logo ? <img src={card.logo.src} width={card.logo.width} height={card.logo.height} alt="" /> : null}
      {card.title ? (
        <div style={{ display: "flex", marginTop: card.logo ? 30 : 0, fontSize: card.logo ? 54 : 70, fontWeight: 800, letterSpacing: -1.5, color: "#0a0a0a", textAlign: "center", lineHeight: 1.1, maxWidth: 1040 }}>
          {clip(card.title, 70)}
        </div>
      ) : null}
      {card.subtitle ? <div style={{ display: "flex", marginTop: 16, fontSize: 30, color: "#4b5563", textAlign: "center", maxWidth: 980 }}>{clip(card.subtitle, 90)}</div> : null}
      {card.details?.length ? (
        <div style={{ display: "flex", alignItems: "center", marginTop: 30, fontSize: 32, color: "#1f2937" }}>
          {card.details.slice(0, 3).map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 ? <div style={{ display: "flex", width: 10, height: 10, borderRadius: 10, background: BLUE, margin: "0 22px" }} /> : null}
              {clip(d, 40)}
            </div>
          ))}
        </div>
      ) : null}
      {card.strip?.length ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: 46, padding: "18px 34px", background: "rgba(255,255,255,0.92)", borderRadius: 999, border: "1px solid #e5e7eb" }}>
          {card.strip.slice(0, 6).map((img, i) => (
            <img key={i} src={img.src} width={img.width} height={img.height} alt="" style={{ margin: "0 18px", opacity: 0.85 }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Product({ card }: { card: ProductCard }) {
  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%", height: "100%", padding: "56px 64px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 500, height: 500, flexShrink: 0, background: "#ffffff", borderRadius: 32, border: "1px solid #e5e7eb", boxShadow: "0 24px 60px rgba(15,23,42,0.12)" }}>
        {card.photo ? <img src={card.photo.src} width={card.photo.width} height={card.photo.height} alt="" /> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, marginLeft: 56 }}>
        {card.brandLogo ? (
          <img src={card.brandLogo.src} width={card.brandLogo.width} height={card.brandLogo.height} alt="" />
        ) : card.brandName ? (
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700, letterSpacing: 5, color: BLUE }}>{card.brandName.toUpperCase()}</div>
        ) : null}
        <div style={{ display: "flex", marginTop: 26, fontSize: 50, fontWeight: 800, letterSpacing: -1, lineHeight: 1.1, color: "#0a0a0a" }}>{clip(card.title, 80)}</div>
        {card.subtitle ? <div style={{ display: "flex", marginTop: 18, fontSize: 26, lineHeight: 1.35, color: "#4b5563" }}>{clip(card.subtitle, 120)}</div> : null}
        <div style={{ display: "flex", alignItems: "center", marginTop: 36 }}>
          <div style={{ display: "flex", padding: "14px 28px", background: "#0a0a0a", color: "#ffffff", borderRadius: 999, fontSize: 24, fontWeight: 700 }}>Ver ficha técnica →</div>
          {card.mark ? <img src={card.mark.src} width={card.mark.width} height={card.mark.height} alt="" style={{ marginLeft: 28 }} /> : null}
        </div>
      </div>
    </div>
  );
}

/** Arma la tarjeta y la devuelve como respuesta PNG (con caché de CDN). */
export async function renderCard(card: HeroCard | ProductCard, options: { origin: string; seed: string; maxAge?: number }): Promise<Response> {
  const fonts = await loadFonts(options.origin);
  const background = await sharp(Buffer.from(networkSvg({ width: OG_WIDTH, height: OG_HEIGHT, points: 72, seed: options.seed, linkDistance: 185 }))).png().toBuffer();
  const svg = await satori(
    // El fondo va como backgroundImage: satori pinta lo posicionado en absoluto por encima del resto.
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: "flex",
        fontFamily: "Inter",
        backgroundImage: `url(data:image/png;base64,${background.toString("base64")})`,
        backgroundSize: `${OG_WIDTH}px ${OG_HEIGHT}px`,
      }}
    >
      {card.kind === "hero" ? <Hero card={card} /> : <Product card={card} />}
    </div>,
    { width: OG_WIDTH, height: OG_HEIGHT, fonts }
  );
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  const maxAge = options.maxAge ?? 3600;
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${maxAge}, s-maxage=86400, stale-while-revalidate=604800` },
  });
}

/** Respuesta de error simple (la tarjeta no debe romper nunca la página que la usa). */
export function cardError(error: unknown, label: string): Response {
  console.error(`[og] No se pudo armar la tarjeta ${label}`, error);
  return new Response("No se pudo armar la imagen.", { status: 500 });
}
