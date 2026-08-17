import { NextRequest, NextResponse } from "next/server";
import type { SyncSourceKind } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SOURCES = new Set<SyncSourceKind>([
  "CRESTRON",
  "SONANCE",
]);

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sourceParam = req.nextUrl.searchParams.get("source");
    if (sourceParam && !SOURCES.has(sourceParam as SyncSourceKind)) {
      throw new Error(`Invalid sync source: ${sourceParam}`);
    }

    const runs = await prisma.syncRun.findMany({
      where: sourceParam
        ? { source: sourceParam as SyncSourceKind }
        : undefined,
      orderBy: { startedAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ ok: true, runs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
