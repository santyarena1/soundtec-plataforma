import { NextRequest, NextResponse } from "next/server";

/**
 * Auth for the temporary Room Builder catalog bridge.
 * Accepts Authorization: Bearer <ROOM_BUILDER_BRIDGE_SECRET>
 * (falls back to SETUP_TOKEN / CRON_SECRET if the dedicated secret is unset).
 */
export function authorizeRoomBuilderBridge(
  req: NextRequest
): NextResponse | null {
  const expected =
    process.env.ROOM_BUILDER_BRIDGE_SECRET ||
    process.env.SETUP_TOKEN ||
    process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Bridge secret not configured" },
      { status: 503 }
    );
  }

  const authorization = req.headers.get("authorization");
  if (authorization !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}
