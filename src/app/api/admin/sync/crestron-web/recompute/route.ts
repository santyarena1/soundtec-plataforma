import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { applyNormalizedProduct } from "@/services/sync/upsert";
import { toNormalizedProduct } from "@/services/crestron-web/normalize";
import { extractModelMentions } from "@/services/crestron-web/enrich";
import type { CrestronEnrichment } from "@/services/crestron-web/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

/**
 * Recalcula el mapeo a columnas/relaciones a partir del enriquecimiento ya
 * guardado en sourceMetadata.crestronCom, SIN volver a consultar crestron.com.
 * Útil cuando cambia el normalizador (ej. nuevas relaciones "Compatible con").
 *   POST /api/admin/sync/crestron-web/recompute  body: { offset?, limit? }
 */
export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = (await req.json().catch(() => ({}))) as { offset?: unknown; limit?: unknown };
  const offset = Math.max(0, Math.trunc(Number(body.offset) || 0));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(Number(body.limit) || DEFAULT_LIMIT)));

  const where = {
    isActive: true,
    internalSku: { not: null },
    brand: { name: { equals: "CRESTRON", mode: "insensitive" as const } },
  };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { internalSku: "asc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        internalSku: true,
        normalizedName: true,
        originalName: true,
        modelNumber: true,
        sourceMetadata: true,
      },
    }),
  ]);

  let recomputed = 0;
  let skipped = 0;
  let compatibleLinks = 0;
  const errors: Array<{ sku: string; error: string }> = [];

  for (const row of rows) {
    const meta = row.sourceMetadata as Record<string, unknown> | null;
    const cached = meta?.crestronCom as Partial<CrestronEnrichment> | undefined;
    if (!row.internalSku || !cached || !cached.page) {
      skipped++;
      continue;
    }
    const enrichment: CrestronEnrichment = {
      fetchedAt: cached.fetchedAt ?? new Date().toISOString(),
      page: cached.page,
      search: cached.search,
      documents: cached.documents ?? [],
      variants: cached.variants ?? [],
      inTheBox: cached.inTheBox ?? [],
      accessories: cached.accessories ?? [],
      related: cached.related ?? [],
      interestedIn: cached.interestedIn ?? [],
      replacements: cached.replacements ?? [],
      compatibleModels: cached.compatibleModels ?? [],
      warnings: cached.warnings ?? [],
    };
    if (enrichment.compatibleModels.length === 0) {
      const known = [
        enrichment.page.model,
        ...enrichment.variants.map((item) => item.model),
        ...enrichment.inTheBox.map((item) => item.model),
        ...enrichment.accessories.map((item) => item.model),
        ...enrichment.related.map((item) => item.model),
        ...enrichment.interestedIn.map((item) => item.model),
      ];
      enrichment.compatibleModels = extractModelMentions(
        [
          enrichment.page.overviewText ?? "",
          ...(enrichment.page.keyFeatures ?? []),
          ...(enrichment.page.footnotes ?? []),
          ...(enrichment.page.specs ?? []).map((spec) => spec.value),
        ],
        known
      );
    }
    try {
      const normalized = toNormalizedProduct(
        {
          internalSku: row.internalSku,
          normalizedName: row.normalizedName,
          originalName: row.originalName,
          modelNumber: row.modelNumber,
        },
        enrichment
      );
      await prisma.$transaction((tx) => applyNormalizedProduct(tx, normalized));
      recomputed++;
      compatibleLinks += await prisma.accessoryRelation.count({
        where: { productId: row.id, kind: "COMPATIBLE" },
      });
    } catch (error) {
      errors.push({
        sku: row.internalSku,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const nextOffset = offset + rows.length;
  return NextResponse.json({
    ok: true,
    total,
    offset,
    processed: rows.length,
    recomputed,
    skipped,
    compatibleLinks,
    errors,
    nextOffset: nextOffset < total ? nextOffset : null,
  });
}
