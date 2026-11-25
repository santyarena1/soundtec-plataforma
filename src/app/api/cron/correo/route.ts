import { NextRequest, NextResponse } from "next/server";
import { processMailQueue } from "@/server/mail/transactional";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Cola de mails del portal (vercel.json › crons, cada 10 minutos): manda los
 * que esperaban cupo por el tope por hora de la casilla y borra el contenido
 * guardado de envíos viejos.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processMailQueue(40);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron correo]", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Error" }, { status: 500 });
  }
}
