import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { processBatch } from "@/services/sync/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> }
) {
  try {
    await requireAdmin();
    const { runId } = await ctx.params;
    const batchSummary = await processBatch(runId);
    return NextResponse.json({ ok: true, ...batchSummary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
