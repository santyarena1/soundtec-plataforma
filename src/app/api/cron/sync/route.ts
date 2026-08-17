import { NextRequest, NextResponse } from "next/server";
import type { SyncSourceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runToCompletion, startRun } from "@/services/sync/pipeline";
import {
  getSchedule,
  isDue,
  lastCompletedRunMs,
} from "@/services/sync/schedule";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SOURCE_KIND: Record<"crestron" | "sonance", SyncSourceKind> = {
  crestron: "CRESTRON",
  sonance: "SONANCE",
};

type SyncSource = keyof typeof SOURCE_KIND;

const RUN_COUNTERS_SELECT = {
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
} as const;

async function executeSource(
  source: SyncSource,
  mode: "preview" | "apply"
) {
  const existing = await prisma.syncRun.findFirst({
    where: {
      source: SOURCE_KIND[source],
      status: { in: ["RUNNING", "APPLYING", "PREVIEW_READY"] },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  const resumed = !!existing;
  const runId = existing
    ? existing.id
    : (await startRun(source, mode, "CRON")).runId;

  await runToCompletion(runId);
  const counters = await prisma.syncRun.findUnique({
    where: { id: runId },
    select: RUN_COUNTERS_SELECT,
  });
  if (!counters) {
    throw new Error(`Sync run not found after processing: ${runId}`);
  }
  return { runId, resumed, counters };
}

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
    if (
      sourceParam !== null &&
      sourceParam !== "crestron" &&
      sourceParam !== "sonance"
    ) {
      return NextResponse.json(
        { ok: false, error: "source must be crestron or sonance" },
        { status: 400 }
      );
    }
    if (sourceParam !== null) {
      const modeParam = req.nextUrl.searchParams.get("mode") ?? "apply";
      if (modeParam !== "preview" && modeParam !== "apply") {
        return NextResponse.json(
          { ok: false, error: "mode must be preview or apply" },
          { status: 400 }
        );
      }
      const result = await executeSource(sourceParam, modeParam);
      return NextResponse.json({
        ok: true,
        runId: result.runId,
        resumed: result.resumed,
        ...result.counters,
      });
    }

    const schedule = await getSchedule();
    const nowUtcMs = Date.now();
    const sources: SyncSource[] = ["crestron", "sonance"];
    const results = [];
    for (const source of sources) {
      try {
        const lastRunMs = await lastCompletedRunMs(source);
        if (!isDue(source, schedule, nowUtcMs, lastRunMs)) {
          results.push({
            source,
            ran: false,
            reason: schedule[source].enabled ? "not_due" : "disabled",
          });
          continue;
        }
        const result = await executeSource(source, "apply");
        results.push({
          source,
          ran: true,
          runId: result.runId,
          resumed: result.resumed,
          counters: result.counters,
        });
      } catch (sourceError) {
        results.push({
          source,
          ran: true,
          error:
            sourceError instanceof Error
              ? sourceError.message
              : "Unknown sync error",
        });
      }
    }
    return NextResponse.json({ ok: true, mode: "scheduler", results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
