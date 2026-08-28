import { prisma } from "@/lib/prisma";

export type QuoteSnapshot = {
  sections: Array<{ id: string; body: string; title: string }>;
  items: Array<{
    id: string;
    description: string;
    quantity: string;
    unitPriceUsd: string;
  }>;
};

export async function captureQuoteSnapshot(quoteId: string): Promise<QuoteSnapshot> {
  const [sections, items] = await Promise.all([
    prisma.quoteSection.findMany({
      where: { quoteId },
      select: { id: true, body: true, title: true },
    }),
    prisma.quoteItem.findMany({
      where: { quoteId },
      select: { id: true, description: true, quantity: true, unitPriceUsd: true },
    }),
  ]);
  return {
    sections,
    items: items.map((i) => ({
      id: i.id,
      description: i.description,
      quantity: String(i.quantity),
      unitPriceUsd: String(i.unitPriceUsd),
    })),
  };
}

export async function recordQuoteSnapshot(input: {
  quoteId: string;
  actorId?: string | null;
  summary: string;
}): Promise<string> {
  const snapshot = await captureQuoteSnapshot(input.quoteId);
  const row = await prisma.quoteRevision.create({
    data: {
      quoteId: input.quoteId,
      actorId: input.actorId ?? null,
      summary: input.summary,
      snapshot,
    },
  });
  return row.id;
}

export async function listQuoteSnapshots(quoteId: string, limit = 40) {
  const rows = await prisma.quoteRevision.findMany({
    where: { quoteId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      summary: true,
      createdAt: true,
      snapshot: true,
      actor: { select: { name: true } },
    },
  });
  return rows.filter((r) => r.snapshot != null);
}

export async function restoreQuoteSnapshot(revisionId: string, actorId?: string | null) {
  const revision = await prisma.quoteRevision.findUnique({ where: { id: revisionId } });
  if (!revision?.snapshot || typeof revision.snapshot !== "object") {
    return { ok: false as const, error: "Este punto de restauración no tiene datos." };
  }
  const snap = revision.snapshot as QuoteSnapshot;
  await recordQuoteSnapshot({
    quoteId: revision.quoteId,
    actorId,
    summary: "Antes de restaurar un cambio anterior",
  });
  await prisma.$transaction([
    ...snap.sections.map((s) =>
      prisma.quoteSection.update({
        where: { id: s.id },
        data: { body: s.body, title: s.title },
      })
    ),
    ...snap.items.map((i) =>
      prisma.quoteItem.update({
        where: { id: i.id },
        data: {
          description: i.description,
          quantity: i.quantity,
          unitPriceUsd: i.unitPriceUsd,
        },
      })
    ),
  ]);
  return { ok: true as const, quoteId: revision.quoteId };
}
