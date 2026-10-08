import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { authorizeRoomBuilderBridge } from "@/lib/room-builder-bridge-auth";
import { enrichOfficialCoverageBatch } from "@/services/room-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  take: z.number().int().min(1).max(40).optional(),
  cursor: z.string().nullable().optional(),
  loops: z.number().int().min(1).max(10).optional(),
  roles: z.array(z.string()).optional(),
});

async function assertAccess(req: NextRequest) {
  const bridgeDenied = authorizeRoomBuilderBridge(req);
  if (!bridgeDenied) return null;
  const session = await auth();
  if (
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "SUPER_ADMIN"
  ) {
    return null;
  }
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const denied = await assertAccess(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido" }, { status: 400 });
  }

  const loops = parsed.data.loops ?? 1;
  let cursor = parsed.data.cursor ?? null;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < loops; i += 1) {
    const batch = await enrichOfficialCoverageBatch({
      take: parsed.data.take,
      cursor,
      roles: parsed.data.roles,
    });
    scanned += batch.scanned;
    updated += batch.updated;
    skipped += batch.skipped;
    failed += batch.failed;
    cursor = batch.nextCursor;
    if (!cursor || batch.scanned === 0) break;
  }

  return NextResponse.json({
    ok: true,
    batch: { scanned, updated, skipped, failed, nextCursor: cursor },
  });
}
