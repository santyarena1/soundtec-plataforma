import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  getRoomProject,
  parseScene,
  resizeSceneMeters,
  updateRoomProjectScene,
} from "@/services/room-builder";

export const dynamic = "force-dynamic";

const schema = z.object({
  widthM: z.number().min(1.5).max(80),
  depthM: z.number().min(1.5).max(80),
  heightM: z.number().min(2.2).max(12).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dimensiones inválidas" }, { status: 400 });
  }

  const project = await getRoomProject(params.id);
  if (!project || project.kind === "hub") {
    return NextResponse.json({ ok: false, error: "Proyecto inválido" }, { status: 404 });
  }
  const scene = parseScene(project.sceneJson);
  if (!scene) {
    return NextResponse.json({ ok: false, error: "Escena inválida" }, { status: 400 });
  }

  const next = resizeSceneMeters(scene, parsed.data);
  await updateRoomProjectScene(params.id, next, {
    areaM2: next.areaM2,
    heightM: next.heightM,
  });
  const fresh = await getRoomProject(params.id);
  return NextResponse.json({ ok: true, project: fresh });
}
