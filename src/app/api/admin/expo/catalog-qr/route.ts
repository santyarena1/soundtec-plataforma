import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-helpers";
import { catalogQrPdf, catalogQrPng, catalogQrSvg } from "@/server/expo/catalog-qr";

export const dynamic = "force-dynamic";

/** Descarga del QR permanente del catálogo: ?formato=pdf (vectorial), svg o png. */
export async function GET(req: NextRequest) {
  await requirePermission("settings.manage");
  const format = req.nextUrl.searchParams.get("formato") ?? "pdf";
  if (format === "svg") {
    return new NextResponse(catalogQrSvg(), {
      headers: { "Content-Type": "image/svg+xml", "Content-Disposition": 'attachment; filename="qr-catalogo-soundtec.svg"' },
    });
  }
  if (format === "png") {
    const png = await catalogQrPng();
    return new NextResponse(Buffer.from(png), {
      headers: { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="qr-catalogo-soundtec.png"' },
    });
  }
  const pdf = await catalogQrPdf();
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="qr-catalogo-soundtec.pdf"' },
  });
}
