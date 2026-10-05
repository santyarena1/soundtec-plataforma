import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDataUrl } from "@/lib/brand-logo";
import { normalizeLogo } from "@/server/brand-logo-normalize";
import { loadLogoSource, publicLogoUrl } from "@/server/brand-logo-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Logo de una marca, recortado y llevado al tamaño común (PNG). Público: lo
 * usan el catálogo y la pantalla del stand. La URL lleva `?v=` con un hash
 * del logo, así que puede cachearse mucho tiempo.
 * Si no se puede normalizar, se sirve el original (o se redirige a la URL).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await prisma.brand.findUnique({ where: { id }, select: { logoUrl: true } }).catch(() => null);
  const logoUrl = brand?.logoUrl?.trim() || null;
  const source = await loadLogoSource(logoUrl);

  if (source) {
    try {
      const png = await normalizeLogo(source.bytes, source.mime);
      return new NextResponse(new Uint8Array(png), {
        headers: {
          ...SECURITY_HEADERS,
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400",
        },
      });
    } catch (error) {
      console.error(`[brand-logo] no se pudo normalizar el logo de ${id}`, error);
    }
    if (isDataUrl(logoUrl)) {
      return new NextResponse(new Uint8Array(source.bytes), {
        headers: { ...SECURITY_HEADERS, "Content-Type": source.mime, "Cache-Control": "public, max-age=3600" },
      });
    }
  }
  const external = logoUrl && !isDataUrl(logoUrl) ? publicLogoUrl(logoUrl) : null;
  if (external) return NextResponse.redirect(external, { headers: { "Cache-Control": "public, max-age=300" } });
  return new NextResponse("Not found", { status: 404 });
}
