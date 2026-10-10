import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { resolveAndWire } from "@/services/room-builder/cabling-resolve";
import { getRoomProject } from "@/services/room-builder/project-service";
import { projectTechnical } from "@/services/room-builder/project-technical";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const settingsSchema = z.object({
  rack: z.object({ u: z.number().min(-1000).max(1000), v: z.number().min(-1000).max(1000) }).nullable().optional(),
  levels: z.record(z.string().min(1).max(64), z.string().min(1).max(40)).optional(),
});

/** Ubicación del rack en la planta del proyecto y piso de cada ambiente. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  const hub = await getRoomProject(params.id);
  if (!hub || hub.kind !== "hub") return NextResponse.json({ ok: false, error: "Proyecto no encontrado" }, { status: 404 });
  const scene = (hub.sceneJson && typeof hub.sceneJson === "object" ? hub.sceneJson : {}) as Record<string, unknown>;
  const current = (scene.technical ?? {}) as Record<string, unknown>;
  const technical = {
    ...current,
    ...(parsed.data.rack !== undefined ? { rack: parsed.data.rack } : {}),
    ...(parsed.data.levels ? { levels: { ...((current.levels as Record<string, string>) ?? {}), ...parsed.data.levels } } : {}),
  };
  await prisma.roomProject.update({ where: { id: params.id }, data: { sceneJson: { ...scene, technical } as unknown as Prisma.InputJsonValue } });
  return NextResponse.json({ ok: true, technical });
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Plano técnico del proyecto completo: equipos, cables, planilla y materiales de todos los ambientes. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  try {
    return NextResponse.json({ ok: true, ...(await projectTechnical(params.id)) });
  } catch (error) {
    console.error(`[room-builder/technical] ${params.id}`, error);
    const message = error instanceof Error ? error.message : "No se pudo armar el plano técnico";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Resolver y trazar todos los ambientes del proyecto (uno por uno). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  try {
    const hub = await getRoomProject(params.id);
    if (!hub || hub.kind !== "hub") return NextResponse.json({ ok: false, error: "Proyecto no encontrado" }, { status: 404 });
    const results = [];
    for (const child of hub.children) {
      const r = await resolveAndWire(child.id);
      results.push({ room: child.name, added: r.added.length, removed: r.removed.length, wires: r.wires });
    }
    return NextResponse.json({ ok: true, results, ...(await projectTechnical(params.id)) });
  } catch (error) {
    console.error(`[room-builder/technical] resolver ${params.id}`, error);
    const message = error instanceof Error ? error.message : "No se pudo resolver el proyecto";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
