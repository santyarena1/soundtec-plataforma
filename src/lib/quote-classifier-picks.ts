// Helpers de clasificadores de una cotización. Sin "use server": solo se llaman desde
// acciones que ya validaron permisos (antes eran acciones sueltas y cualquiera podía
// borrar los clasificadores de cualquier COT).

import { prisma } from "@/lib/prisma";
import { inferClassifierPicks, listQuoteClassifiers } from "@/lib/quote-classifiers";

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
