import { NextRequest, NextResponse } from "next/server";
import { runMailingQueue } from "@/lib/mailing/sender";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Margen antes del corte de Vercel (300 s): la última tanda tiene que terminar. */
const BUDGET_MS = 240_000;

/**
 * Cola de campañas por mail (vercel.json › crons, cada 5 minutos): arranca
 * las programadas que vencieron y manda tandas de las que están saliendo.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runMailingQueue(Date.now() + BUDGET_MS);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron mailing]", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Error" }, { status: 500 });
  }
}
