import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { z } from "zod";
import { addProductToProject, analyzeProjectSystem } from "@/services/room-builder/system-check-db";

export const dynamic = "force-dynamic";

/** Chequeo de sistema del ambiente: amplificación, control, red y streaming. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  try {
    const result = await analyzeProjectSystem(params.id);
    if (!result) return NextResponse.json({ ok: false, error: "Proyecto no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, findings: result.findings });
  } catch (error) {
    console.error(`[room-builder/system] ${params.id}`, error);
    return NextResponse.json({ ok: false, error: "No se pudo revisar el sistema" }, { status: 500 });
  }
}

const addSchema = z.object({ productId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(48).default(1) });

/** Agrega al proyecto un producto sugerido por el chequeo (switch, streamer…). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Producto inválido" }, { status: 400 });
  try {
    const project = await addProductToProject(params.id, parsed.data.productId, parsed.data.quantity);
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo agregar";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
