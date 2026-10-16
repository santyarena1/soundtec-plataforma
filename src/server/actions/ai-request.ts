"use server";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { suggestRequestResponse } from "@/services/openai";

export async function generateRequestAiSuggestion(requestId: string) {
  await requireStaff("requests.respond");
  const request = await prisma.customerRequest.findUnique({
    where: { id: requestId },
    include: { items: { include: { product: { select: { normalizedName: true } } } } },
  });
  if (!request) return { ok: false, error: "Pedido no encontrado" } as const;

  const suggestion = await suggestRequestResponse({
    project: request.projectDescription || undefined,
    items: request.items.map((i) => ({ name: i.product.normalizedName, quantity: i.quantity })),
  });

  await prisma.customerRequest.update({
    where: { id: requestId },
    data: { aiSuggestedResponse: suggestion },
  });

  return { ok: true, suggestion } as const;
}
