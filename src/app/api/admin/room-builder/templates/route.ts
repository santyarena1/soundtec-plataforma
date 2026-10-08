import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { listHubPresets, listRoomTemplates } from "@/services/room-builder";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  return NextResponse.json({
    ok: true,
    templates: listRoomTemplates(),
    hubs: listHubPresets(),
  });
}
