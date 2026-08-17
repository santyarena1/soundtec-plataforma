import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { startRun } from "@/services/sync/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin();
    const { slug } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
    if (body.mode !== "preview" && body.mode !== "apply") {
      throw new Error('mode must be "preview" or "apply"');
    }

    const { runId } = await startRun(slug, body.mode, "MANUAL");
    const run = await prisma.syncRun.findUniqueOrThrow({
      where: { id: runId },
      select: { source: true },
    });
    await prisma.syncRun.updateMany({
      where: {
        source: run.source,
        id: { not: runId },
        status: { in: ["RUNNING", "APPLYING", "PREVIEW_READY"] },
      },
      data: {
        status: "FAILED",
        error: "Reemplazada por una corrida nueva",
        finishedAt: new Date(),
      },
    });
    return NextResponse.json({
      ok: true,
      runId,
      done: false,
      processed: 0,
      total: 0,
      nextOffset: 0,
      created: 0,
      updated: 0,
      priceChanges: 0,
      stockChanges: 0,
      errors: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
