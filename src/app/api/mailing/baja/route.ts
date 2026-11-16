import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/mailing/unsubscribe-token";
import { unsubscribe } from "@/lib/mailing/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Baja en un clic (RFC 8058): Gmail, Yahoo y Apple Mail hacen un POST acá
 * desde su botón «Desuscribirse» (encabezado List-Unsubscribe-Post). No pide
 * confirmación. Un GET (alguien que abre el enlace) va a la página /baja.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const payload = verifyUnsubscribeToken(token);
  if (!payload) return NextResponse.json({ ok: false, error: "Enlace inválido" }, { status: 400 });
  await unsubscribe(payload.email, payload.campaignId ?? null, "Botón «Desuscribirse» del programa de mail");
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/baja/${encodeURIComponent(token)}`, req.nextUrl));
}
