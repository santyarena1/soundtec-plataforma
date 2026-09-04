import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { rollbackSyncRun } from "@/services/sync/rollback";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> }
) {
  try {
    await requireAdmin();
    const { runId } = await ctx.params;
    const result = await rollbackSyncRun(runId);
    if (!result.ok && result.error && result.restored === 0 && result.deactivated === 0) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      restored: result.restored,
      deactivated: result.deactivated,
      skipped: result.skipped,
      errors: result.errors,
      error: result.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown rollback error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
