import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { resolveAndWire } from "@/services/room-builder/cabling-resolve";
import { getRoomProject } from "@/services/room-builder/project-service";
import { projectTechnical } from "@/services/room-builder/project-technical";

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
