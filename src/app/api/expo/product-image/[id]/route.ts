import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { fetchPublicImage, publicLogoUrl } from "@/server/brand-logo-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_SIDE = 1400;

/**
 * Foto principal de un producto para la vidriera del stand, sin el margen
 * blanco o transparente que traen muchas fotos de fabricante: así el
 * producto ocupa la tarjeta. Si no se puede recortar, redirige a la original.
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
  if (source) {
    try {
      const trimmed = await sharp(source.bytes, { animated: false }).trim({ threshold: 14 }).toBuffer();
      const webp = await sharp(trimmed)
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86 })
        .toBuffer();
      return new NextResponse(new Uint8Array(webp), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error(`[product-image] no se pudo recortar la foto de ${id}`, error);
    }
  }
  if (url) return NextResponse.redirect(url, { headers: { "Cache-Control": "public, max-age=300" } });
  return new NextResponse("Not found", { status: 404 });
}
