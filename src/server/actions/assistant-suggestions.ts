"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-helpers";
import { setSetting } from "@/lib/settings";
import { ASSISTANT_SUGGESTIONS_KEY, validateQuestions, type SuggestedQuestion } from "@/lib/assistant-suggestions";
import { prisma } from "@/lib/prisma";

type Result = { ok: true } | { ok: false; error: string };

function revalidateAssistant() {
  revalidatePath("/admin/assistant", "layout");
  revalidatePath("/expo");
}

/** Guarda la lista completa (orden incluido). */
export async function saveSuggestedQuestionsAction(questions: SuggestedQuestion[]): Promise<Result> {
  await requirePermission("settings.manage");
  const valid = validateQuestions(questions);
  if (!valid.ok) return valid;
  await setSetting(ASSISTANT_SUGGESTIONS_KEY, JSON.stringify(valid.questions), {
    description: "Preguntas sugeridas del asistente de productos (Expo, catálogo, portal, admin).",
  });
  revalidateAssistant();
  return { ok: true };
}

/** Vuelve a las preguntas de siempre (borra lo cargado). */
export async function resetSuggestedQuestionsAction(): Promise<Result> {
  await requirePermission("settings.manage");
  await prisma.adminSetting.deleteMany({ where: { key: ASSISTANT_SUGGESTIONS_KEY } });
  revalidateAssistant();
  return { ok: true };
}
