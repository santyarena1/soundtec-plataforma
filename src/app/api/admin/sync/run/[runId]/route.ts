import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> }
) {
  try {
    await requireAdmin();
    const { runId } = await ctx.params;
    const run = await prisma.syncRun.findUnique({ where: { id: runId } });
    if (!run) {
      return NextResponse.json(
        { ok: false, error: "Sync run not found" },
        { status: 404 }
      );
    }

    const rows = await prisma.syncStagedProduct.findMany({
      where: { syncRunId: runId },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        matchValue: true,
        action: true,
        status: true,
        diffJson: true,
        error: true,
      },
    });
    return NextResponse.json({ ok: true, run, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
