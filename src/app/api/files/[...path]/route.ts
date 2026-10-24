import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { SERVABLE_PREFIXES, isBlobConfigured } from "@/lib/blob-storage";

export const dynamic = "force-dynamic";

/**
 * Sirve los archivos del almacenamiento privado (logos, fotos, planos, Excel).
 * Los nombres llevan un sufijo al azar, así que la URL no se adivina; se cachea
 * un año porque un archivo subido no cambia (uno nuevo tiene otro nombre).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const pathname = (path ?? []).map((part) => decodeURIComponent(part)).join("/");
  if (!pathname || pathname.includes("..") || !SERVABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.json({ error: "Archivo inválido." }, { status: 400 });
  }
  if (!isBlobConfigured()) return NextResponse.json({ error: "Sin almacenamiento." }, { status: 503 });

  try {
    const result = await get(pathname, { access: "private" });
    if (!result || !result.stream) return NextResponse.json({ error: "No existe." }, { status: 404 });
    return new NextResponse(result.stream as ReadableStream, {
      headers: {
        "content-type": result.blob.contentType || "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        // Un SVG abierto directo no puede correr scripts en el dominio del sitio.
        "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        ...(result.blob.contentDisposition ? { "content-disposition": result.blob.contentDisposition } : {}),
      },
    });
  } catch (error) {
    console.error("[api/files]", pathname, error);
    return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 502 });
  }
}
