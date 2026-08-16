"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser } from "@/lib/quote-access";
import { sanitizeQuoteHtml } from "@/lib/quote-richtext";

function revalidate(quoteId: string) {
  revalidatePath(`/admin/quotes/${quoteId}`);
}

export async function createQuoteItemGroup(input: {
  quoteId: string;
  title?: string;
}): Promise<{ ok: boolean; error?: string; groupId?: string }> {
  const loaded = await loadQuoteForUser(input.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "La cotización ya está emitida." };

  const count = await prisma.quoteItemGroup.count({ where: { quoteId: input.quoteId } });
  const title = (input.title || "").trim() || `Ambiente ${count + 1}`;
  const group = await prisma.quoteItemGroup.create({
    data: {
      quoteId: input.quoteId,
      title,
      body: "",
      sortOrder: count,
    },
  });
  revalidate(input.quoteId);
  return { ok: true, groupId: group.id };
}

export async function updateQuoteItemGroup(input: {
  groupId: string;
  title?: string;
  body?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const group = await prisma.quoteItemGroup.findUnique({ where: { id: input.groupId } });
  if (!group) return { ok: false, error: "Ese ambiente ya no existe." };
  const loaded = await loadQuoteForUser(group.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "La cotización ya está emitida." };

  const data: { title?: string; body?: string } = {};
  if (input.title != null) {
    const title = input.title.trim();
    if (!title) return { ok: false, error: "El ambiente necesita un título." };
    data.title = title;
  }
  if (input.body != null) data.body = sanitizeQuoteHtml(input.body);
  await prisma.quoteItemGroup.update({ where: { id: group.id }, data });
  revalidate(group.quoteId);
  return { ok: true };
}

export async function deleteQuoteItemGroup(input: {
  groupId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const group = await prisma.quoteItemGroup.findUnique({ where: { id: input.groupId } });
  if (!group) return { ok: false, error: "Ese ambiente ya no existe." };
  const loaded = await loadQuoteForUser(group.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "La cotización ya está emitida." };

  await prisma.quoteItem.updateMany({ where: { groupId: group.id }, data: { groupId: null } });
  await prisma.quoteItemGroup.delete({ where: { id: group.id } });
  revalidate(group.quoteId);
  return { ok: true };
}

export async function moveQuoteItemToGroup(input: {
  itemId: string;
  groupId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const item = await prisma.quoteItem.findUnique({ where: { id: input.itemId } });
  if (!item) return { ok: false, error: "El ítem ya no existe." };
  const loaded = await loadQuoteForUser(item.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "La cotización ya está emitida." };

  if (input.groupId) {
    const group = await prisma.quoteItemGroup.findFirst({
      where: { id: input.groupId, quoteId: item.quoteId },
    });
    if (!group) return { ok: false, error: "Ese ambiente no es de esta cotización." };
  }

  await prisma.quoteItem.update({
    where: { id: item.id },
    data: { groupId: input.groupId },
  });
  revalidate(item.quoteId);
  return { ok: true };
}
