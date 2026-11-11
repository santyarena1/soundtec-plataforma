import { NextRequest, NextResponse } from "next/server";
import { servedFilePath } from "@/lib/blob-storage";
import { MAX_BYTES, knockOutWhite, readLogo } from "@/lib/forms/logo-image";

export const runtime = "nodejs";

/** Si no se puede limpiar, el original (solo rutas propias: nada de redirigir a otros sitios). */
function fallback(src: string, req: NextRequest): NextResponse {
  const own = servedFilePath(src) != null || (src.startsWith("/") && !src.startsWith("//"));
  return own ? NextResponse.redirect(new URL(src, req.url), 302) : new NextResponse("Imagen no disponible.", { status: 404 });
}

/** Logo del formulario sin el fondo blanco (para que no se vea la caja sobre fondos de color). */
export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("u") ?? "";
  if (!src || src.length > 2000) return new NextResponse("Falta la imagen.", { status: 400 });
  try {
    const original = await readLogo(src, req.url);
    if (!original || original.length > MAX_BYTES) return fallback(src, req);
    const clean = await knockOutWhite(original, req.nextUrl.searchParams.get("fondo") === "oscuro");
    // Ya tenía transparencia: se usa el original.
    if (!clean) return fallback(src, req);
    return new NextResponse(new Uint8Array(clean), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[forms] No se pudo limpiar el logo", error);
    return fallback(src, req);
  }
}
