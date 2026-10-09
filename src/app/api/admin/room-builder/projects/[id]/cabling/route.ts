import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { cablingProfile } from "@/services/room-builder/cabling-db";

export const dynamic = "force-dynamic";

/** Puertos de cada equipo del ambiente y si va a un rack central (el cableado se arma en el navegador). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  try {
    const profile = await cablingProfile(params.id);
    if (!profile) return NextResponse.json({ ok: false, error: "Proyecto no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    console.error(`[room-builder/cabling] ${params.id}`, error);
    return NextResponse.json({ ok: false, error: "No se pudo leer el cableado" }, { status: 500 });
  }
}
