import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { fetchPublicImage, publicLogoUrl } from "@/server/brand-logo-source";
import { keyOutBackground } from "@/server/room-builder/cutout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_SIDE = 1024;
/** Si casi no queda producto, el recorte salió mal: mejor no mostrarlo. */
const MIN_VISIBLE = 0.04;

/**
 * Foto del producto sin fondo (PNG/WebP con transparencia) para ponerla a
 * escala dentro de la sala 3D. 404 si no hay foto o no se pudo recortar:
 * el visor usa entonces el modelo genérico del tipo de equipo.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await prisma.product
    .findUnique({
      where: { id },
      select: { images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { url: true } } },
    })
    .catch(() => null);
  const raw = product?.images[0]?.url?.trim();
  if (!raw) return new NextResponse("Not found", { status: 404 });

  const url = publicLogoUrl(raw.startsWith("/") ? `${appUrl()}${raw}` : raw);
  const source = url ? await fetchPublicImage(url, MAX_SOURCE_BYTES) : null;
  if (!source) return new NextResponse("Not found", { status: 404 });

  try {
    const { data, info } = await sharp(source.bytes, { animated: false })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const keyed = keyOutBackground(new Uint8Array(data), info.width, info.height);
    if (keyed.visibleRatio < MIN_VISIBLE) return new NextResponse("Not found", { status: 404 });

    const webp = await sharp(Buffer.from(keyed.data), { raw: { width: info.width, height: info.height, channels: 4 } })
      .trim({ threshold: 1 })
      .webp({ quality: 88, alphaQuality: 90 })
      .toBuffer();
    return new NextResponse(new Uint8Array(webp), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(`[room-builder/cutout] no se pudo recortar la foto de ${id}`, error);
    return new NextResponse("Not found", { status: 404 });
  }
}
