import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { translateCategoriesToEs } from "@/services/openai";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export interface TranslateResponse {
  ok: boolean;
  error?: string;
  translations?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { items?: unknown };
    const items = Array.isArray(body.items)
      ? body.items.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];

    if (items.length === 0) {
      return NextResponse.json({ ok: true, translations: {} } satisfies TranslateResponse);
    }

    const translations = await translateCategoriesToEs({
      items,
      context: "Crestron control AV / audio / video profesional",
    });

    return NextResponse.json({ ok: true, translations } satisfies TranslateResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error } satisfies TranslateResponse, { status: 500 });
  }
}
