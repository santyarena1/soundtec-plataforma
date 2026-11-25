"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser, requireQuotePermission } from "@/lib/quote-access";
import { applyQuoteClassifierPicks, readClassifierPicksFromForm } from "@/lib/quote-classifier-picks";

function revalidateClassifiers(quoteId?: string) {
  revalidatePath("/admin/settings/quotes/clasificadores");
  revalidatePath("/admin/settings/quotes");
  revalidatePath("/admin/quotes/new");
  if (quoteId) revalidatePath(`/admin/quotes/${quoteId}`);
}

export async function saveQuoteClassifierPicks(formData: FormData): Promise<void> {
  const quoteId = String(formData.get("quoteId") || "");
  await requireQuotePermission("quotes.edit");
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return;
  const { picks } = await readClassifierPicksFromForm(formData);
  await applyQuoteClassifierPicks(quoteId, picks);
  revalidateClassifiers(quoteId);
}

export async function createQuoteClassifier(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.manage_library");
  const label = String(formData.get("label") || "").trim();
  if (!label) return;
  const sort = await prisma.quoteClassifier.count();
  await prisma.quoteClassifier.create({
    data: { label, hint: String(formData.get("hint") || "").trim() || null, sortOrder: sort },
  });
  revalidateClassifiers();
}

export async function addQuoteClassifierOption(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.manage_library");
  const classifierId = String(formData.get("classifierId") || "");
  const label = String(formData.get("label") || "").trim();
  if (!classifierId || !label) return;
  const sort = await prisma.quoteClassifierOption.count({ where: { classifierId } });
  await prisma.quoteClassifierOption.create({
    data: { classifierId, label, sortOrder: sort },
  });
  revalidateClassifiers();
}

export async function renameQuoteClassifier(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.manage_library");
  const id = String(formData.get("id") || "");
  const label = String(formData.get("label") || "").trim();
  if (!id || !label) return;
  await prisma.quoteClassifier.update({
    where: { id },
    data: { label, hint: String(formData.get("hint") || "").trim() || null },
  });
  revalidateClassifiers();
}

export async function renameQuoteClassifierOption(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.manage_library");
  const id = String(formData.get("id") || "");
  const label = String(formData.get("label") || "").trim();
  if (!id || !label) return;
  await prisma.quoteClassifierOption.update({ where: { id }, data: { label } });
  revalidateClassifiers();
}

export async function archiveQuoteClassifier(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.manage_library");
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.quoteClassifier.update({ where: { id }, data: { isActive: false } });
  revalidateClassifiers();
}

export async function archiveQuoteClassifierOption(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.manage_library");
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.quoteClassifierOption.update({ where: { id }, data: { isActive: false } });
  revalidateClassifiers();
}
