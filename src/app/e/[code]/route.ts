import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isValidQrCode } from "@/lib/expo/qr-code";
import { QR_COOKIE, VISITOR_COOKIE, VISITOR_COOKIE_OPTIONS } from "@/lib/expo/visitor-cookies";
import { findQrWithEvent, recordVisit } from "@/server/expo/visits";

export const dynamic = "force-dynamic";

/**
 * Destino de cada QR: cuenta el escaneo, recuerda de qué QR vino el
 * visitante y lo manda al catálogo (donde la bienvenida decide qué mostrar).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = new URL("/catalogo", req.url);
  const res = NextResponse.redirect(target);
  if (!isValidQrCode(code)) return res;

  const qr = await findQrWithEvent(code);
  if (!qr) return res;

  const visitorId = req.cookies.get(VISITOR_COOKIE)?.value || randomUUID();
  res.cookies.set(VISITOR_COOKIE, visitorId, VISITOR_COOKIE_OPTIONS);
  res.cookies.set(QR_COOKIE, qr.code, VISITOR_COOKIE_OPTIONS);
  await recordVisit({ visitorId, qrId: qr.id, type: "SCAN" });
  return res;
}
