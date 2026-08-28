"use server";

import { revalidatePath } from "next/cache";
import { loadQuoteForUser, requireQuotePermission } from "@/lib/quote-access";
import { listQuoteSnapshots, restoreQuoteSnapshot, recordQuoteSnapshot } from "@/lib/quote-edit-history";

export async function fetchQuoteEditHistory(quoteId: string) {
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return { ok: false as const, error: "Sin acceso.", items: [] };
  const items = await listQuoteSnapshots(quoteId);
  return { ok: true as const, items };
}

export async function restoreQuoteEditHistory(revisionId: string) {
  const { user } = await requireQuotePermission("quotes.edit");
  const result = await restoreQuoteSnapshot(revisionId, user.id);
  if (!result.ok) return result;
  revalidatePath(`/admin/quotes/${result.quoteId}`);
  return { ok: true as const, quoteId: result.quoteId };
}

export async function undoQuoteEdit(quoteId: string) {
  const { user } = await requireQuotePermission("quotes.edit");
  const items = await listQuoteSnapshots(quoteId, 2);
  if (items.length < 2) return { ok: false as const, error: "No hay un cambio anterior para deshacer." };
  const target = items[1];
  const result = await restoreQuoteSnapshot(target.id, user.id);
  if (!result.ok) return result;
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true as const };
}

export async function snapshotBeforeQuoteEdit(quoteId: string, summary: string) {
  const { user } = await requireQuotePermission("quotes.edit");
  await recordQuoteSnapshot({ quoteId, actorId: user.id, summary });
  return { ok: true as const };
}
