"use server";

import { Prisma, QuoteNodeSource } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { readAiSuggestions, spacesWithoutSuggestion } from "@/lib/quote-ai-suggestions";
import { addProductToQuote } from "@/server/actions/quotes";

async function persistWithout(quoteId: string, spaces: unknown, key: string) {
  await prisma.quoteContext.upsert({
    where: { quoteId },
    create: { quoteId, spaces: spacesWithoutSuggestion(null, key) as Prisma.InputJsonValue },
    update: { spaces: spacesWithoutSuggestion(spaces, key) as Prisma.InputJsonValue },
  });
}

export async function approveQuoteSuggestion(input: {
  quoteId: string;
  key: string;
}): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadQuoteForUser(input.quoteId);
  if (!loaded.quote) return { ok: false, error: "Cotización no encontrada." };
  if (!loaded.permissions.fullAccess && !permissionsHave(loaded.permissions, "quotes.edit")) {
    return { ok: false, error: "Sin permiso de edición." };
  }
  if (loaded.quote.status === "ISSUED") {
    return { ok: false, error: "Una COT emitida no se edita." };
  }

  const [ctx, items, alternatives] = await Promise.all([
    prisma.quoteContext.findUnique({ where: { quoteId: input.quoteId } }),
    prisma.quoteItem.findMany({
      where: { quoteId: input.quoteId },
      select: { productId: true, sortOrder: true },
    }),
    prisma.quoteAlternative.findMany({
      where: { quoteId: input.quoteId },
      select: { id: true, isDefault: true },
    }),
  ]);

  const spaces = ctx?.spaces;
  const suggestion = readAiSuggestions(spaces).find((row) => row.key === input.key);
  if (!suggestion) return { ok: false, error: "Esa sugerencia ya no está." };

  if (suggestion.kind === "SERVICE") {
    const sort = items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
    await prisma.quoteItem.create({
      data: {
        quoteId: input.quoteId,
        alternativeId: alternatives.find((a) => a.isDefault)?.id ?? alternatives[0]?.id,
        kind: "SERVICE",
        serviceType: suggestion.serviceType || "servicio",
        quantity: new Prisma.Decimal(suggestion.quantity),
        description: suggestion.name,
        unitPriceUsd: new Prisma.Decimal(0),
        lineTotalUsd: new Prisma.Decimal(0),
        ivaRate: new Prisma.Decimal(21),
        source: QuoteNodeSource.SUGGESTED,
        sortOrder: sort,
      },
    });
  } else if (suggestion.productId) {
    const already = items.some((item) => item.productId === suggestion.productId);
    if (!already) {
      const fd = new FormData();
      fd.set("quoteId", input.quoteId);
      fd.set("productId", suggestion.productId);
      fd.set("quantity", String(suggestion.quantity));
      const result = await addProductToQuote(fd);
      if (!result.ok) return result;
    }
  } else {
    return { ok: false, error: "No está en el catálogo. Buscalo a mano en Productos." };
  }

  await persistWithout(input.quoteId, spaces, input.key);
  revalidatePath(`/admin/quotes/${input.quoteId}`);
  return { ok: true };
}

export async function dismissQuoteSuggestion(input: {
  quoteId: string;
  key: string;
}): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadQuoteForUser(input.quoteId);
  if (!loaded.quote) return { ok: false, error: "Cotización no encontrada." };
  if (!loaded.permissions.fullAccess && !permissionsHave(loaded.permissions, "quotes.edit")) {
    return { ok: false, error: "Sin permiso de edición." };
  }
  if (loaded.quote.status === "ISSUED") {
    return { ok: false, error: "Una COT emitida no se edita." };
  }

  const ctx = await prisma.quoteContext.findUnique({ where: { quoteId: input.quoteId } });
  const spaces = ctx?.spaces;
  if (!readAiSuggestions(spaces).some((row) => row.key === input.key)) {
    return { ok: false, error: "Esa sugerencia ya no está." };
  }

  await persistWithout(input.quoteId, spaces, input.key);
  revalidatePath(`/admin/quotes/${input.quoteId}`);
  return { ok: true };
}
