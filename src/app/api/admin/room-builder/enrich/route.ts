import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { authorizeRoomBuilderBridge } from "@/lib/room-builder-bridge-auth";
import {
  designProfileStats,
  enrichDesignProfilesBatch,
} from "@/services/room-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  take: z.number().int().min(1).max(200).optional(),
  cursor: z.string().nullable().optional(),
  onlyMissing: z.boolean().optional(),
  loops: z.number().int().min(1).max(20).optional(),
});

async function assertEnrichAccess(req: NextRequest) {
  const bridgeDenied = authorizeRoomBuilderBridge(req);
  if (!bridgeDenied) return null;
  // Rol leído de la base (no del JWT, que puede tener hasta 30 días).
  const user = await getSessionUser().catch(() => null);
  if (
    user?.role === "ADMIN" ||
    user?.role === "SUPER_ADMIN"
  ) {
    return null;
  }
  return bridgeDenied.status === 503
    ? NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    : bridgeDenied;
}

export async function GET(req: NextRequest) {
  const denied = await assertEnrichAccess(req);
  if (denied) return denied;
  const stats = await designProfileStats();
  return NextResponse.json({ ok: true, stats });
}

export async function POST(req: NextRequest) {
  const denied = await assertEnrichAccess(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido" }, { status: 400 });
  }

  const loops = parsed.data.loops ?? 1;
  let cursor = parsed.data.cursor ?? null;
  let scanned = 0;
  let upserted = 0;
  let skipped = 0;

  for (let i = 0; i < loops; i += 1) {
    const batch = await enrichDesignProfilesBatch({
      take: parsed.data.take,
      cursor,
      onlyMissing: parsed.data.onlyMissing,
    });
    scanned += batch.scanned;
    upserted += batch.upserted;
    skipped += batch.skipped;
    cursor = batch.nextCursor;
    if (!cursor || batch.scanned === 0) break;
  }

  const stats = await designProfileStats();
  return NextResponse.json({
    ok: true,
    batch: { scanned, upserted, skipped, nextCursor: cursor },
    stats,
  });
}
