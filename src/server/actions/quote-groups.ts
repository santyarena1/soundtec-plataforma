"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser, requireQuotePermission, loadQuoteForEdit } from "@/lib/quote-access";
import { sanitizeQuoteHtml } from "@/lib/quote-richtext";
import { alternativeOf, rowsOfAlternative, targetAlternativeId } from "@/lib/quote-alternatives";

function revalidate(quoteId: string) {
  revalidatePath(`/admin/quotes/${quoteId}`);
}

export async function createQuoteItemGroup(input: {
  quoteId: string;
  title?: string;
  /** Alternativa en la que se arma el ambiente (cada una tiene los suyos). */
  alternativeId?: string | null;
}): Promise<{ ok: boolean; error?: string; groupId?: string }> {
  await requireQuotePermission("quotes.edit");
  const loaded = await loadQuoteForEdit(input.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };

  const alternatives = loaded.quote.alternatives;
  const alternativeId = targetAlternativeId({ alternatives, requested: input.alternativeId });
  const count = rowsOfAlternative(loaded.quote.itemGroups, alternativeId, alternatives).length;
  const title = (input.title || "").trim() || `Ambiente ${count + 1}`;
  const sortOrder = loaded.quote.itemGroups.reduce((max, g) => Math.max(max, g.sortOrder), -1) + 1;
  const group = await prisma.quoteItemGroup.create({
    data: {
      quoteId: input.quoteId,
      alternativeId,
      title,
      body: "",
      sortOrder,
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
  await requireQuotePermission("quotes.edit");
  const group = await prisma.quoteItemGroup.findUnique({ where: { id: input.groupId } });
  if (!group) return { ok: false, error: "Ese ambiente ya no existe." };
  const loaded = await loadQuoteForEdit(group.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };

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
  await requireQuotePermission("quotes.edit");
  const group = await prisma.quoteItemGroup.findUnique({ where: { id: input.groupId } });
  if (!group) return { ok: false, error: "Ese ambiente ya no existe." };
  const loaded = await loadQuoteForEdit(group.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };

  await prisma.quoteItem.updateMany({ where: { groupId: group.id }, data: { groupId: null } });
  await prisma.quoteItemGroup.delete({ where: { id: group.id } });
  revalidate(group.quoteId);
  return { ok: true };
}

export async function moveQuoteItemToGroup(input: {
  itemId: string;
  groupId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  await requireQuotePermission("quotes.edit");
  const item = await prisma.quoteItem.findUnique({ where: { id: input.itemId } });
  if (!item) return { ok: false, error: "El ítem ya no existe." };
  const loaded = await loadQuoteForEdit(item.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };

  if (input.groupId) {
    const group = await prisma.quoteItemGroup.findFirst({
      where: { id: input.groupId, quoteId: item.quoteId },
    });
    if (!group) return { ok: false, error: "Ese ambiente no es de esta cotización." };
    const alternatives = loaded.quote.alternatives;
    if (alternativeOf(group, alternatives) !== alternativeOf(item, alternatives)) {
      return { ok: false, error: "Ese ambiente es de otra alternativa." };
    }
  }

  // Las líneas «incluido sin cargo» acompañan a su producto.
  await prisma.quoteItem.updateMany({
    where: { OR: [{ id: item.id }, { includedWithId: item.id }] },
    data: { groupId: input.groupId },
  });
  revalidate(item.quoteId);
  return { ok: true };
}
