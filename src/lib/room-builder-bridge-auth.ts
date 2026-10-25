import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Auth del puente de catálogo del Room Builder (devuelve costos).
 * Solo Authorization: Bearer <ROOM_BUILDER_BRIDGE_SECRET>. Antes caía a
 * SETUP_TOKEN / CRON_SECRET si faltaba: un secreto de otra cosa abría los costos.
 */
export function authorizeRoomBuilderBridge(req: NextRequest): NextResponse | null {
  const expected = process.env.ROOM_BUILDER_BRIDGE_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Bridge secret not configured" }, { status: 503 });
  }
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${expected}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
