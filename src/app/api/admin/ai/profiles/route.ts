/**
 * Construcción por lotes de los perfiles de producto del asistente.
 *
 *   GET  /api/admin/ai/profiles            → estado (cuántos hay, cuántos faltan)
 *   POST /api/admin/ai/profiles { limit, force }  → procesa una tanda
 *
 * Se procesa en tandas cortas para no chocar con el límite de tiempo de la
 * función. El panel del admin las encadena hasta terminar.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProfiles, countPending } from "@/services/ai-assistant/profile/build";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

export async function GET() {
  await requireAdmin();
  const [{ total, withProfile }, lastBuilt, environments] = await Promise.all([
    countPending(),
    prisma.productAiProfile.findFirst({
      orderBy: { builtAt: "desc" },
      select: { builtAt: true, model: true },
    }),
    prisma.productAiProfile.groupBy({
      by: ["environment"],
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    total,
    withProfile,
    pending: Math.max(0, total - withProfile),
    lastBuiltAt: lastBuilt?.builtAt ?? null,
    model: lastBuilt?.model ?? null,
    byEnvironment: environments.map((row) => ({
      environment: row.environment ?? "SIN DATO",
      count: row._count._all,
    })),
  });
}

export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = (await req.json().catch(() => ({}))) as { limit?: unknown; force?: unknown };
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(Number(body.limit) || DEFAULT_LIMIT)));
  const force = body.force === true;

  try {
    // Se corta antes del límite de la función para poder responder siempre.
    const stats = await buildProfiles({ limit, force, deadlineMs: 240_000 });
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    console.error("ai profiles build error", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo construir el lote de perfiles." },
      { status: 500 }
    );
  }
}
