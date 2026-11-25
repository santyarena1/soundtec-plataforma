import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireRoomProjectAccess } from "@/server/room-builder/access";
import { prisma } from "@/lib/prisma";
import { getRoomProject } from "@/services/room-builder/project-service";
import { projectRackInputs, roomRackInput } from "@/services/room-builder/rack/rack-db";

export const dynamic = "force-dynamic";

/**
 * Datos del frente del rack: de un ambiente (su rack) o del proyecto (rack
 * central + el de cada ambiente). El navegador arma la elevación con
 * rack/rack-elevation.ts para reordenar sin volver al servidor.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireRoomProjectAccess(params.id);
  try {
    const project = await getRoomProject(params.id);
    if (!project) return NextResponse.json({ ok: false, error: "Proyecto no encontrado" }, { status: 404 });
    if (project.kind === "hub") return NextResponse.json({ ok: true, racks: await projectRackInputs(params.id) });
    const rack = await roomRackInput(params.id);
    return NextResponse.json({ ok: true, racks: rack ? [rack] : [] });
  } catch (error) {
    console.error(`[room-builder/rack] ${params.id}`, error);
    return NextResponse.json({ ok: false, error: "No se pudo armar el rack" }, { status: 500 });
  }
}

const orderSchema = z.object({
  /** Proyecto o ambiente cuyo rack se ordena (el propio o un ambiente del proyecto). */
  rackId: z.string().min(1).max(64).optional(),
  order: z.array(z.string().min(1).max(400)).max(300).nullable(),
});

/** Guarda el orden del frente del rack (rackOrder en la escena); null vuelve al orden lógico. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  await requireRoomProjectAccess(params.id);
  const parsed = orderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  const targetId = parsed.data.rackId ?? params.id;
  const target = await prisma.roomProject.findUnique({ where: { id: targetId }, select: { id: true, parentId: true, sceneJson: true } });
  // Solo el propio proyecto o uno de sus ambientes.
  if (!target || (target.id !== params.id && target.parentId !== params.id)) return NextResponse.json({ ok: false, error: "Rack no encontrado" }, { status: 404 });
  const scene = (target.sceneJson && typeof target.sceneJson === "object" ? target.sceneJson : {}) as Record<string, unknown>;
  await prisma.roomProject.update({ where: { id: target.id }, data: { sceneJson: { ...scene, rackOrder: parsed.data.order } as unknown as Prisma.InputJsonValue } });
  return NextResponse.json({ ok: true });
}
