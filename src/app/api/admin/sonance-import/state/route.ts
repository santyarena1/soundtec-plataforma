import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const TRANSLATIONS_KEY = "sonance.category_translations";
const TARGET_KEY = "sonance.category_target";
const STATE_KEY = "sonance.sync_state"; // { createNew }

type Target = "categoria" | "familia" | "rubro" | "subrubro";

// POST — auto-save user's in-flight edits (translations, target, createNew)
// para que sobrevivan a un refresh sin necesidad de aplicar todavía.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      translations?: Record<string, string>;
      target?: Target;
      createNew?: boolean;
    };

    const writes: Promise<unknown>[] = [];
    if (body.translations && typeof body.translations === "object") {
      // Sanitize: only persist string→string entries
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.translations)) {
        if (typeof v === "string") clean[k] = v;
      }
      writes.push(setSetting(TRANSLATIONS_KEY, JSON.stringify(clean)));
    }
    if (
      body.target &&
      ["categoria", "familia", "rubro", "subrubro"].includes(body.target)
    ) {
      writes.push(setSetting(TARGET_KEY, body.target));
    }
    if (typeof body.createNew === "boolean") {
      writes.push(
        setSetting(STATE_KEY, JSON.stringify({ createNew: body.createNew }))
      );
    }
    await Promise.all(writes);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

// GET — returns the saved createNew flag (so the client can hydrate on mount)
export async function GET() {
  try {
    await requireAdmin();
    const raw = await getSetting(STATE_KEY, "");
    let createNew = false;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.createNew === "boolean") createNew = parsed.createNew;
      } catch {}
    }
    return NextResponse.json({ ok: true, createNew });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
