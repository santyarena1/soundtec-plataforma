import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDataUrl, parseLogoDataUrl } from "@/lib/brand-logo";

export const dynamic = "force-dynamic";

/**
 * Sirve el logo subido de una marca. Público (lo usan el catálogo y la
 * pantalla del stand). Un SVG no puede ejecutar nada: CSP sin scripts + sandbox.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await prisma.brand.findUnique({ where: { id }, select: { logoUrl: true } }).catch(() => null);
  const parsed = brand && isDataUrl(brand.logoUrl) ? parseLogoDataUrl(brand.logoUrl) : null;
  if (!parsed) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(parsed.bytes), {
    headers: {
      "Content-Type": parsed.mime,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
