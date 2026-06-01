import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { getSetting, setSetting } from "@/lib/settings";
import { API_PATHS } from "@/services/portal-path-resolver";

export const dynamic = "force-dynamic";

const MAPPING_KEY = "sonance.field_mapping";

// GET — devuelve el mapping persistido + el catálogo de paths agrupados
export async function GET() {
  try {
    await requireAdmin();
    const raw = await getSetting(MAPPING_KEY, "{}");
    let mapping: Record<string, string> = {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") mapping = parsed;
    } catch { /* ignore */ }

    return NextResponse.json({
      ok: true,
      mapping,
      apiPaths: API_PATHS,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

// POST — guarda el mapping (debounced auto-save desde la UI)
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { mapping?: Record<string, string> };
    if (!body.mapping || typeof body.mapping !== "object") {
      return NextResponse.json({ ok: false, error: "Falta mapping" }, { status: 400 });
    }
    // Sanitize: keep only string→string entries
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.mapping)) {
      if (typeof v === "string") clean[k] = v;
    }
    await setSetting(MAPPING_KEY, JSON.stringify(clean));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
