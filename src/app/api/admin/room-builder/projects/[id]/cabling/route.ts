import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth-helpers";
import { cablingProfile } from "@/services/room-builder/cabling-db";
import { roomTrunk } from "@/services/room-builder/cable-list-db";
import { resolveAndWire } from "@/services/room-builder/cabling-resolve";
import { getRoomProject } from "@/services/room-builder/project-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Puertos de cada equipo del ambiente y si va a un rack central (el cableado se arma en el navegador). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireStaff("room_builder.use");
  try {
    const profile = await cablingProfile(params.id);
    if (!profile) return NextResponse.json({ ok: false, error: "Proyecto no encontrado" }, { status: 404 });
    // Troncal hasta el rack central del proyecto (los cables al rack se miden completos).
    const trunk = profile.central ? await roomTrunk(params.id) : null;
    return NextResponse.json({ ok: true, profile, trunk });
  } catch (error) {
    console.error(`[room-builder/cabling] ${params.id}`, error);
    return NextResponse.json({ ok: false, error: "No se pudo leer el cableado" }, { status: 500 });
  }
}

/** Resolver y trazar: suma lo que falta (genéricos), recalcula y traza todos los cables. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await requireStaff("room_builder.use");
  try {
    const result = await resolveAndWire(params.id);
    const project = await getRoomProject(params.id);
    return NextResponse.json({ ok: true, ...result, project });
  } catch (error) {
    console.error(`[room-builder/cabling] resolver ${params.id}`, error);
    const message = error instanceof Error ? error.message : "No se pudo resolver el cableado";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
