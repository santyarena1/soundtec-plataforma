import { NextResponse } from "next/server";
import { z } from "zod";
import { generateQuoteFromBrief } from "@/server/actions/quote-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({ brief: z.string().max(20000).optional() }).catch({});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const body = bodySchema.parse(raw);
  try {
    const r = await generateQuoteFromBrief(id, { brief: body.brief });
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (error) {
    // Los redirect de permisos (NEXT_REDIRECT) no tienen que verse como error de IA.
    if (error && typeof error === "object" && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
      return NextResponse.json({ ok: false, error: "No tenés permiso para editar esta cotización." }, { status: 403 });
    }
    console.error("[api] generate", error);
    return NextResponse.json({ ok: false, error: "Error inesperado al generar la propuesta." }, { status: 500 });
  }
}
