import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
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

    const filter = req.nextUrl.searchParams.get("filter") || "all";
    const take = Math.min(
      500,
      Math.max(20, Number(req.nextUrl.searchParams.get("take") || "100") || 100)
    );

    const where: {
      syncRunId: string;
      action?: string | { in: string[] };
      status?: string;
    } = { syncRunId: runId };

    if (filter === "changed") {
      where.action = { in: ["create", "update"] };
    } else if (filter === "price") {
      // Filtrado en memoria abajo por diffJson
    } else if (filter === "errors") {
      where.status = "error";
    } else if (filter === "noop") {
      where.action = "noop";
    }

    const rows = await prisma.syncStagedProduct.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: filter === "price" ? 2000 : take,
      select: {
        id: true,
        matchValue: true,
        action: true,
        status: true,
        diffJson: true,
        beforeJson: true,
        error: true,
        productId: true,
      },
    });

    const filtered =
      filter === "price"
        ? rows
            .filter((row) => {
              const diff = row.diffJson as { priceChanged?: boolean } | null;
              return diff?.priceChanged === true;
            })
            .slice(0, take)
        : rows;

    const changeSummary = await prisma.syncStagedProduct.groupBy({
      by: ["action"],
      where: { syncRunId: runId },
      _count: { _all: true },
    });

    return NextResponse.json({
      ok: true,
      run,
      rows: filtered,
      changeSummary: Object.fromEntries(
        changeSummary.map((row) => [row.action, row._count._all])
      ),
      canRollback:
        run.mode === "apply" &&
        run.status === "COMPLETED" &&
        !run.rolledBackAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
