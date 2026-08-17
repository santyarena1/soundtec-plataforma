import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { processBatch, startRun } from "@/services/sync/pipeline";

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
    const batchSummary = await processBatch(runId);
    return NextResponse.json({ ok: true, runId, ...batchSummary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
