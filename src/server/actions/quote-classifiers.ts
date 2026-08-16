"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser, requireQuotePermission } from "@/lib/quote-access";
import {
  inferClassifierPicks,
  listQuoteClassifiers,
} from "@/lib/quote-classifiers";

function revalidateClassifiers(quoteId?: string) {
  revalidatePath("/admin/settings/quotes/clasificadores");
  revalidatePath("/admin/settings/quotes");
  revalidatePath("/admin/quotes/new");
  if (quoteId) revalidatePath(`/admin/quotes/${quoteId}`);
}

export async function readClassifierPicksFromForm(formData: FormData) {
  const classifiers = await listQuoteClassifiers();
  const picks: Record<string, string> = {};
  for (const classifier of classifiers) {
    const value = String(formData.get(`classifier_${classifier.id}`) || "").trim();
    if (value) picks[classifier.id] = value;
  }
  const prompt = String(formData.get("intentPrompt") || formData.get("brief") || "");
  const inferred = inferClassifierPicks(prompt, classifiers);
  for (const [classifierId, optionId] of Object.entries(inferred)) {
    if (!picks[classifierId]) picks[classifierId] = optionId;
  }
  return { classifiers, picks, prompt };
}

export async function applyQuoteClassifierPicks(quoteId: string, picks: Record<string, string>) {
  const classifiers = await listQuoteClassifiers();
  const valid = new Set(classifiers.flatMap((item) => item.options.map((option) => option.id)));
  await prisma.quoteClassifierPick.deleteMany({ where: { quoteId } });
  const rows = Object.entries(picks).filter(([, optionId]) => valid.has(optionId));
  if (rows.length) {
    await prisma.quoteClassifierPick.createMany({
      data: rows.map(([classifierId, optionId]) => ({ quoteId, classifierId, optionId })),
    });
  }
  const labels = classifiers
    .map((classifier) => {
      const option = classifier.options.find((item) => item.id === picks[classifier.id]);
      return option?.label;
    })
    .filter(Boolean);
  await prisma.quote.update({
    where: { id: quoteId },
    data: { projectType: labels[0] || null },
  });
}

export async function saveQuoteClassifierPicks(formData: FormData): Promise<void> {
  const quoteId = String(formData.get("quoteId") || "");
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote || loaded.quote.status === "ISSUED") return;
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
