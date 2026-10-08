import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { autoFillProjectSlots, getRoomProject } from "@/services/room-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  try {
    const result = await autoFillProjectSlots(params.id, {
      includeOptional: false,
    });
    const project = await getRoomProject(params.id);
    return NextResponse.json({ ok: true, ...result, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
