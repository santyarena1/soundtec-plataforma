import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { buildIoProfiles, ioProfileStats } from "@/services/room-builder/io-profile/build";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Avance de la carga de puertos reales (fichas del fabricante). */
export async function GET() {
  await requireAdmin();
  try {
    return NextResponse.json({ ok: true, stats: await ioProfileStats() });
  } catch (error) {
    console.error("[room-builder/io-profiles] stats", error);
    return NextResponse.json({ ok: false, error: "No se pudo leer el avance" }, { status: 500 });
  }
}

const schema = z.object({
  limit: z.number().int().min(1).max(40).default(12),
  force: z.boolean().default(false),
  productIds: z.array(z.string().min(1).max(64)).max(40).optional(),
});

/** Una tanda: lee la ficha de cada producto (y la busca en el sitio del fabricante si falta) y extrae sus puertos. */
export async function POST(req: Request) {
  await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Pedido inválido" }, { status: 400 });
  try {
    const result = await buildIoProfiles({ ...parsed.data, deadlineMs: 230_000 });
    return NextResponse.json({ ok: true, result, stats: await ioProfileStats() });
  } catch (error) {
    console.error("[room-builder/io-profiles] build", error);
    const message = error instanceof Error ? error.message : "No se pudo procesar";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
