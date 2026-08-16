"use server";

import { prisma } from "@/lib/prisma";
import { parseHistoricalWorkbookFromBytes } from "@/lib/quote-history-parse";
import type { IngestHistoricalResult } from "@/lib/quote-history-parse";
import { authorizeHistoryIngest, ingestFail, persistHistoricalSheets } from "@/lib/quote-history-persist";

export type { IngestHistoricalResult };

export async function ingestHistoricalWorkbook(formData: FormData): Promise<IngestHistoricalResult> {
  try {
    const authz = await authorizeHistoryIngest();
    if (!authz.ok) return ingestFail(authz.error);

    const file = formData.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return ingestFail("Subí el Excel de planillas.");
    }
    if (file.size > 40 * 1024 * 1024) {
      return ingestFail("El archivo supera los 40 MB. Dividí el Excel y subilo por partes.");
    }

    const parsed = parseHistoricalWorkbookFromBytes(
      await file.arrayBuffer(),
      "name" in file && typeof file.name === "string" ? file.name : "Planillas de Cotizacion.xlsx"
    );
    if (!parsed.ok) {
      return ingestFail(parsed.error, parsed.sheets, parsed.lines);
    }

    return persistHistoricalSheets(parsed.sourceFile, parsed.sheets);
  } catch (error) {
    console.error("ingestHistoricalWorkbook", error);
    const detail = error instanceof Error ? error.message : "error desconocido";
    if (/NEXT_REDIRECT/i.test(detail) || (typeof error === "object" && error && "digest" in error)) {
      return ingestFail("No tenés permiso para ingestar planillas históricas.");
    }
    return ingestFail(`No se pudo ingestar el Excel (${detail}).`);
  }
}

export async function suggestHistoricalCompanions(productIds: string[]) {
  if (productIds.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, normalizedName: true, modelNumber: true, supplierSku: true, brand: { select: { name: true } } },
  });
  const tokens = products
    .flatMap((p) => [p.modelNumber, p.supplierSku, p.normalizedName.split(/\s+/).pop()])
    .filter((t): t is string => Boolean(t && t.length >= 3));
  if (tokens.length === 0) return [];

  const lines = await prisma.historicalQuoteLine.findMany({
    where: {
      OR: tokens.slice(0, 12).map((t) => ({ description: { contains: t, mode: "insensitive" as const } })),
    },
    take: 80,
    select: { sheetId: true },
  });
  const sheetIds = [...new Set(lines.map((l) => l.sheetId))];
  if (sheetIds.length === 0) return [];
  const companions = await prisma.historicalQuoteLine.findMany({
    where: { sheetId: { in: sheetIds } },
    take: 400,
    select: { description: true },
  });
  const already = new Set(tokens.map((t) => t.toLowerCase()));
  const counts = new Map<string, number>();
  for (const c of companions) {
    const key = c.description.slice(0, 80);
    if (already.has(key.toLowerCase())) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([description, count]) => ({ description, count }));
}
