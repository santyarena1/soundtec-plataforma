import { getSetting } from "@/lib/settings";
import { ASSISTANT_SUGGESTIONS_KEY, parseQuestionsSetting, questionsFor, type AssistantContext, type SuggestedQuestion } from "@/lib/assistant-suggestions";

/** Lo cargado por los admins (null = nada cargado: valen las de siempre). */
export async function loadSuggestedQuestions(): Promise<SuggestedQuestion[] | null> {
  return parseQuestionsSetting(await getSetting(ASSISTANT_SUGGESTIONS_KEY, ""));
}

/** Preguntas sugeridas para una pantalla del asistente. */
export async function suggestedQuestionsFor(context: AssistantContext): Promise<string[]> {
  return questionsFor(await loadSuggestedQuestions(), context);
}
