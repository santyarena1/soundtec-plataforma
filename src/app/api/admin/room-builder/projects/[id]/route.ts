import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  deleteRoomProject,
  getRoomProject,
  parseScene,
  updateRoomProjectScene,
} from "@/services/room-builder";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  scene: z.unknown().optional(),
  name: z.string().min(1).max(200).optional(),
  platform: z.string().nullable().optional(),
  unitCount: z.number().int().positive().optional(),
  status: z.enum(["draft", "ready", "quoted"]).optional(),
  notes: z.string().max(4000).nullable().optional(),
  areaM2: z.number().positive().optional(),
  heightM: z.number().positive().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  const project = await getRoomProject(params.id);
  if (!project) {
    return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, project });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido" }, { status: 400 });
  }

  const existing = await getRoomProject(params.id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
  }

  const scene =
    parsed.data.scene !== undefined
      ? parseScene(parsed.data.scene)
      : parseScene(existing.sceneJson);

  if (!scene) {
    return NextResponse.json({ ok: false, error: "Escena inválida" }, { status: 400 });
  }

  await updateRoomProjectScene(params.id, scene, {
    name: parsed.data.name,
    platform: parsed.data.platform,
    unitCount: parsed.data.unitCount,
    status: parsed.data.status,
    notes: parsed.data.notes,
    areaM2: parsed.data.areaM2,
    heightM: parsed.data.heightM,
  });

  const project = await getRoomProject(params.id);
  return NextResponse.json({ ok: true, project });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  await deleteRoomProject(params.id);
  return NextResponse.json({ ok: true });
}
