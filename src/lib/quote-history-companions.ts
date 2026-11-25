// Productos que suelen acompañar a otros en las planillas históricas de cotización.
// Sin "use server": lo llama el orquestador de cotizaciones, que ya validó permisos.

import { prisma } from "@/lib/prisma";

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
