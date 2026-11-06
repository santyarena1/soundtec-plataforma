import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { QR_COOKIE, SKIP_COOKIE, VISITOR_COOKIE, VISITOR_COOKIE_OPTIONS } from "@/lib/expo/visitor-cookies";

export const dynamic = "force-dynamic";

/**
 * Destino del QR permanente del catálogo (no vence ni depende de un evento):
 * lleva directo a la grilla de marcas del catálogo público (sin precios), sin
 * la pantalla que pide el mail. Si el destino cambia, se cambia acá y los QR
 * ya impresos siguen andando.
 */
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/catalogo", req.url), 302);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(VISITOR_COOKIE, req.cookies.get(VISITOR_COOKIE)?.value || randomUUID(), VISITOR_COOKIE_OPTIONS);
  // Como «Saltear» de la bienvenida; y sin atribuir la visita a un QR de evento anterior.
  res.cookies.set(SKIP_COOKIE, "1", VISITOR_COOKIE_OPTIONS);
  res.cookies.delete(QR_COOKIE);
  return res;
}
