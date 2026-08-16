import { prisma } from "@/lib/prisma";

async function historicalHints(productIds: string[]) {
  if (productIds.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { normalizedName: true, modelNumber: true, supplierSku: true },
  });
  const tokens = products
    .flatMap((product) => [product.modelNumber, product.supplierSku, product.normalizedName.split(/\s+/).pop()])
    .filter((token): token is string => Boolean(token && token.length >= 3));
  if (!tokens.length) return [];
  const lines = await prisma.historicalQuoteLine.findMany({
    where: {
      OR: tokens.slice(0, 12).map((token) => ({ description: { contains: token, mode: "insensitive" as const } })),
    },
    take: 80,
    select: { sheetId: true },
  });
  const sheetIds = [...new Set(lines.map((line) => line.sheetId))];
  if (!sheetIds.length) return [];
  const companions = await prisma.historicalQuoteLine.findMany({
    where: { sheetId: { in: sheetIds } },
    take: 400,
    select: { description: true },
  });
  const already = new Set(tokens.map((token) => token.toLowerCase()));
  const counts = new Map<string, number>();
  for (const companion of companions) {
    const key = companion.description.slice(0, 80);
    if (already.has(key.toLowerCase())) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([description, count]) => ({ description, count }));
}

export type PatternSuggestion = {
  productId: string;
  name: string;
  count: number;
  reason: string;
};

export type SimilarQuoteSummary = {
  id: string;
  number: string;
  reference: string | null;
  score: number;
  labels: string;
};

export async function loadQuotePatternSuggestions(quoteId: string): Promise<{
  summary: string;
  similar: SimilarQuoteSummary[];
  suggestions: PatternSuggestion[];
}> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      classifierPicks: { include: { option: { include: { classifier: true } } } },
      items: { select: { productId: true } },
    },
  });
  if (!quote) return { summary: "", similar: [], suggestions: [] };

  const optionIds = quote.classifierPicks.map((pick) => pick.optionId);
  const labels = quote.classifierPicks.map((pick) => `${pick.option.classifier.label}: ${pick.option.label}`);
  const summary = labels.join(" · ");
  const already = new Set(quote.items.map((item) => item.productId).filter(Boolean) as string[]);

  if (optionIds.length === 0) {
    const productIds = [...already];
    const historical = productIds.length ? await historicalHints(productIds) : [];
    return {
      summary: "",
      similar: [],
      suggestions: historical.slice(0, 6).map((row) => ({
        productId: "",
        name: row.description,
        count: row.count,
        reason: "Apareció junto en planillas históricas",
      })),
    };
  }

  const others = await prisma.quote.findMany({
    where: {
      id: { not: quoteId },
      classifierPicks: { some: { optionId: { in: optionIds } } },
      items: { some: { productId: { not: null } } },
    },
    include: {
      classifierPicks: { include: { option: { include: { classifier: true } } } },
      items: {
        where: { excluded: false, productId: { not: null } },
        include: {
          product: { select: { id: true, normalizedName: true, brand: { select: { name: true } } } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  const myClassifiers = new Set(quote.classifierPicks.map((pick) => pick.classifierId));
  const scored = others
    .map((other) => {
      let score = 0;
      const otherLabels: string[] = [];
      for (const pick of other.classifierPicks) {
        otherLabels.push(`${pick.option.classifier.label}: ${pick.option.label}`);
        if (optionIds.includes(pick.optionId)) score += 3;
        else if (myClassifiers.has(pick.classifierId)) score += 1;
      }
      return { other, score, labels: otherLabels.join(" · ") };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const counts = new Map<string, { name: string; count: number; exact: number }>();
  for (const row of scored) {
    for (const item of row.other.items) {
      if (!item.productId || !item.product || already.has(item.productId)) continue;
      const name = [item.product.brand?.name, item.product.normalizedName].filter(Boolean).join(" — ");
      const prev = counts.get(item.productId) || { name, count: 0, exact: 0 };
      prev.count += 1;
      if (row.score >= 3) prev.exact += 1;
      counts.set(item.productId, prev);
    }
  }

  const suggestions: PatternSuggestion[] = [...counts.entries()]
    .sort((a, b) => b[1].exact - a[1].exact || b[1].count - a[1].count)
    .slice(0, 10)
    .map(([productId, info]) => ({
      productId,
      name: info.name,
      count: info.count,
      reason:
        info.exact > 0
          ? `En ${info.count} COT con la misma clasificación`
          : `En ${info.count} COT del mismo tipo, otra escala`,
    }));

  if (suggestions.length < 4 && already.size) {
    const historical = await historicalHints([...already]);
    for (const row of historical) {
      if (suggestions.length >= 10) break;
      if (suggestions.some((item) => item.name.toLowerCase().includes(row.description.slice(0, 24).toLowerCase()))) {
        continue;
      }
      suggestions.push({
        productId: "",
        name: row.description,
        count: row.count,
        reason: "Suele ir junto en planillas históricas",
      });
    }
  }

  return {
    summary,
    similar: scored.slice(0, 5).map((row) => ({
      id: row.other.id,
      number: row.other.number,
      reference: row.other.reference,
      score: row.score,
      labels: row.labels,
    })),
    suggestions,
  };
}
