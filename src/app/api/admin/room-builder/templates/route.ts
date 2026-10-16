import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth-helpers";
import { listHubPresets, listRoomTemplates } from "@/services/room-builder";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireStaff("room_builder.use");
  return NextResponse.json({
    ok: true,
    templates: listRoomTemplates(),
    hubs: listHubPresets(),
  });
}
