import { NextRequest, NextResponse } from "next/server";
import type { SyncSourceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runToCompletion, startRun } from "@/services/sync/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SOURCE_KIND: Record<"crestron" | "sonance", SyncSourceKind> = {
  crestron: "CRESTRON",
  sonance: "SONANCE",
};

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const sourceParam = req.nextUrl.searchParams.get("source");
    if (sourceParam !== "crestron" && sourceParam !== "sonance") {
      return NextResponse.json(
        { ok: false, error: "source must be crestron or sonance" },
        { status: 400 }
      );
    }
    const modeParam = req.nextUrl.searchParams.get("mode") ?? "apply";
    if (modeParam !== "preview" && modeParam !== "apply") {
      return NextResponse.json(
        { ok: false, error: "mode must be preview or apply" },
        { status: 400 }
      );
    }

    const existing = await prisma.syncRun.findFirst({
      where: {
        source: SOURCE_KIND[sourceParam],
        status: { in: ["RUNNING", "APPLYING", "PREVIEW_READY"] },
      },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });

    const resumed = !!existing;
    const runId = existing
      ? existing.id
      : (await startRun(sourceParam, modeParam, "CRON")).runId;

    await runToCompletion(runId);

    const run = await prisma.syncRun.findUnique({
      where: { id: runId },
      select: {
        status: true,
        totalItems: true,
        processed: true,
        matched: true,
        created: true,
        updated: true,
        priceChanges: true,
        stockChanges: true,
        errors: true,
        error: true,
        finishedAt: true,
      },
    });
    if (!run) throw new Error(`Sync run not found after processing: ${runId}`);

    return NextResponse.json({ ok: true, runId, resumed, ...run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
