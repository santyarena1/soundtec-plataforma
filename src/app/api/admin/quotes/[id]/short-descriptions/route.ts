import { NextResponse } from "next/server";
import { ensureQuoteProductShortDescriptions } from "@/server/actions/quote-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Completa descripciones cortas faltantes (tope por pedido). Es ruta y no
 * server action a propósito: las acciones del navegador se encolan de a una y
 * esta llamada a la IA trababa los guardados mientras corría.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const r = await ensureQuoteProductShortDescriptions(id);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (error) {
    // Los redirect de permisos (NEXT_REDIRECT) no son un error de la IA.
    if (error && typeof error === "object" && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
      return NextResponse.json({ ok: false, error: "No tenés permiso para editar esta cotización." }, { status: 403 });
    }
    console.error("[api] short-descriptions", error);
    return NextResponse.json({ ok: false, error: "No se pudieron completar las descripciones." }, { status: 500 });
  }
}
