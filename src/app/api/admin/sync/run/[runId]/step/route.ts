import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { processBatch } from "@/services/sync/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ runId: string }> }
) {
  try {
    await requireAdmin();
    const { runId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { batchSize?: unknown };
    const requested = Number(body.batchSize);
    const batchSize =
      Number.isFinite(requested) && requested >= 1
        ? Math.min(MAX_BATCH_SIZE, Math.trunc(requested))
        : DEFAULT_BATCH_SIZE;
    const batchSummary = await processBatch(runId, batchSize);
    return NextResponse.json({ ok: true, ...batchSummary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
