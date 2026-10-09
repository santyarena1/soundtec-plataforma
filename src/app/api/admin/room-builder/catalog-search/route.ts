import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { searchCatalog } from "@/services/room-builder/custom-devices";

export const dynamic = "force-dynamic";

/** Búsqueda libre en todo el catálogo (con foto) para ubicar cualquier producto. */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  try {
    return NextResponse.json({ ok: true, results: await searchCatalog(q) });
  } catch (error) {
    console.error("[room-builder/catalog-search]", error);
    return NextResponse.json({ ok: false, error: "No se pudo buscar en el catálogo" }, { status: 500 });
  }
}
