import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildIoProfiles, ioProfileStats } from "@/services/room-builder/io-profile/build";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Avance de la carga de puertos reales (fichas del fabricante). */
export async function GET(req: Request) {
  await requireAdmin();
  try {
    // ?sample=N: las últimas fichas leídas, para revisar la calidad.
    const sample = Math.min(50, Number(new URL(req.url).searchParams.get("sample") ?? 0) || 0);
    const recent = sample
      ? await prisma.productIoProfile.findMany({
          orderBy: { builtAt: "desc" },
          take: sample,
          select: { status: true, confidence: true, source: true, sourceUrls: true, ports: true, capabilities: true, rejected: true, notes: true, model: true, product: { select: { normalizedName: true, brand: { select: { name: true } } } } },
        })
      : undefined;
    return NextResponse.json({ ok: true, stats: await ioProfileStats(), recent });
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
