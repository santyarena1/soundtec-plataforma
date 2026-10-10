import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { completeSpaceEquipment } from "@/services/room-builder/equipment-complete";

export const dynamic = "force-dynamic";
/** Busca y asigna productos del catálogo: puede tardar. */
export const maxDuration = 120;

/** Completa los equipos que faltan en el ambiente (y en el rack central del proyecto). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  try {
    const result = await completeSpaceEquipment(params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(`[room-builder/complete-equipment] ${params.id}`, error);
    const message = error instanceof Error ? error.message : "No se pudieron completar los equipos";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
