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
  const [{ total, withProfile, pending }, lastBuilt, environments, sample] = await Promise.all([
    countPending(),
    prisma.productAiProfile.findFirst({
      orderBy: { builtAt: "desc" },
      select: { builtAt: true, model: true },
    }),
    prisma.productAiProfile.groupBy({
      by: ["environment"],
      _count: { _all: true },
    }),
    // Muestra reciente: sirve para auditar a ojo que la clasificación tenga
    // sentido antes de confiar en ella para responderle a un visitante.
    prisma.productAiProfile.findMany({
      orderBy: { builtAt: "desc" },
      take: 12,
      select: {
        environment: true,
        environmentBasis: true,
        environmentEvidence: true,
        productType: true,
        ipRating: true,
        mountTypes: true,
        audioLine: true,
        ecosystems: true,
        applications: true,
        summaryEs: true,
        product: { select: { id: true, normalizedName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    total,
    withProfile,
    pending,
    lastBuiltAt: lastBuilt?.builtAt ?? null,
    model: lastBuilt?.model ?? null,
    byEnvironment: environments.map((row) => ({
      environment: row.environment ?? "SIN DATO",
      count: row._count._all,
    })),
    sample: sample.map((row) => ({
      id: row.product.id,
      name: row.product.normalizedName,
      productType: row.productType,
      environment: row.environment,
      environmentBasis: row.environmentBasis,
      environmentEvidence: row.environmentEvidence,
      ipRating: row.ipRating,
      mountTypes: row.mountTypes,
      audioLine: row.audioLine,
      ecosystems: row.ecosystems,
      applications: row.applications,
      summaryEs: row.summaryEs,
    })),
  });
}

/**
 * Evidencias que no respaldan nada porque el modelo copió el enunciado.
 * Se limpian con una consulta: el ambiente y el resto del perfil siguen
 * siendo válidos, así que no hace falta volver a gastar tokens.
 */
const BAD_EVIDENCE = ["frase textual", "razón de la deducción", "razon de la deduccion"];

async function cleanupEvidence(): Promise<number> {
  const rows = await prisma.productAiProfile.findMany({
    where: { OR: BAD_EVIDENCE.map((text) => ({ environmentEvidence: { contains: text, mode: "insensitive" as const } })) },
    select: { id: true, productType: true, environment: true },
  });

  for (const row of rows) {
    await prisma.productAiProfile.update({
      where: { id: row.id },
      data: {
        environmentBasis: "INFERRED",
        environmentEvidence: `Tipo de equipo (${row.productType ?? "producto"}): ${
          row.environment === "OUTDOOR"
            ? "apto para intemperie"
            : row.environment === "BOTH"
              ? "interior y exterior"
              : "instalación en interior"
        }.`,
      },
    });
  }
  return rows.length;
}

export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = (await req.json().catch(() => ({}))) as {
    limit?: unknown;
    force?: unknown;
    cleanup?: unknown;
  };

  if (body.cleanup === true) {
    const cleaned = await cleanupEvidence();
    return NextResponse.json({ ok: true, cleaned });
  }
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
