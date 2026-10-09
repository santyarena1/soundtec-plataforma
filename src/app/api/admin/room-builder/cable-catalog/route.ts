import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { loadCableCatalog } from "@/services/room-builder/cable-catalog";

export const dynamic = "force-dynamic";

/** Cables del catálogo clasificados (señal, armado o rollo, largo) para el cableado. */
export async function GET() {
  await requireAdmin();
  try {
    return NextResponse.json({ ok: true, cables: await loadCableCatalog() });
  } catch (error) {
    console.error("[room-builder/cable-catalog]", error);
    return NextResponse.json({ ok: false, error: "No se pudo leer el catálogo de cables" }, { status: 500 });
  }
}
