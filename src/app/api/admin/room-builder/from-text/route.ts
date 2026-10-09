import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { interpretRoomText } from "@/server/room-builder/room-from-text";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ text: z.string().trim().min(8).max(1000) });

/** Interpreta una frase ("sala de reuniones 6x4 con Teams…") como ambiente del asistente, para confirmar antes de generar. */
export async function POST(req: Request) {
  await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Contá un poco más: qué ambiente es, medidas y qué tiene que tener." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, plan: await interpretRoomText(parsed.data.text) });
  } catch (error) {
    console.error("[room-builder/from-text]", error);
    const message = error instanceof Error ? error.message : "No se pudo interpretar";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
