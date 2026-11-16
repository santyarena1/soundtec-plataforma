import { NextRequest, NextResponse } from "next/server";
import { getMailingConfig } from "@/lib/mailing/config";
import { verifySvixSignature } from "@/lib/mailing/webhook-signature";
import { applyResendEvent, type ResendEvent } from "@/lib/mailing/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de Resend: entregado, abierto, clic, rebote, queja, fallo.
 * Se configura en resend.com › Webhooks con la URL
 * https://www.soundtecportal.com.ar/api/webhooks/resend y el secreto
 * («whsec_…») va en RESEND_WEBHOOK_SECRET o en Campañas › Configuración.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  if (body.length > 256_000) return NextResponse.json({ ok: false, error: "Demasiado grande" }, { status: 413 });
  const { webhookSecret } = await getMailingConfig();
  const check = verifySvixSignature(
    webhookSecret,
    { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") },
    body
  );
  if (!check.ok) return NextResponse.json({ ok: false, error: check.reason }, { status: 401 });
  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  if (!event?.type) return NextResponse.json({ ok: false, error: "Sin tipo" }, { status: 400 });
  try {
    const result = await applyResendEvent(req.headers.get("svix-id")!, event);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[webhook resend]", event.type, error);
    // 500: Resend lo reintenta más tarde.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
