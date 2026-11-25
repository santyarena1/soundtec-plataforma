/**
 * Preguntas sugeridas del asistente de productos (Soundtec AI): los botones
 * que aparecen antes de escribir. Se editan en Asistente › Preguntas sugeridas
 * y se guardan en AdminSetting como JSON. Sin nada cargado se usan las de
 * siempre (DEFAULT_*).
 */
import { z } from "zod";

export const ASSISTANT_SUGGESTIONS_KEY = "assistant.suggested_questions";

export const ASSISTANT_CONTEXTS = ["expo", "catalogo", "portal", "admin"] as const;
export type AssistantContext = (typeof ASSISTANT_CONTEXTS)[number];

export const CONTEXT_LABEL: Record<AssistantContext, string> = {
  expo: "Expo (QR del stand)",
  catalogo: "Catálogo público",
  portal: "Portal de clientes",
  admin: "Admin",
};

export interface SuggestedQuestion {
  id: string;
  text: string;
  active: boolean;
  /** Dónde se muestra. Vacío = en todos lados. */
  contexts: AssistantContext[];
}

/** Cuántas se muestran como máximo en pantalla. */
export const MAX_SHOWN = 6;
export const MAX_QUESTIONS = 40;
export const MAX_TEXT = 160;

export const DEFAULT_PUBLIC_QUESTIONS = [
  "¿Qué parlantes de embutir en techo tienen?",
  "Dame 5 opciones de parlantes para exterior",
  "¿Qué parlantes tienen protección IP66?",
  "¿Qué productos son compatibles con Crestron Home?",
];

export const DEFAULT_ADMIN_QUESTIONS = [
  "¿Qué parlantes tenemos con protección IP66?",
  "Dame 5 opciones de parlantes para exterior",
  "¿Qué amplificadores Sonance tenemos?",
  "¿Qué productos son compatibles con Crestron Home?",
];

/** Lista inicial del editor: las de siempre, con el contexto donde se veían. */
export function defaultQuestions(): SuggestedQuestion[] {
  // Una pregunta que estaba en las dos listas va una sola vez, con los contextos de ambas.
  const byText = new Map<string, SuggestedQuestion>();
  const add = (text: string, contexts: AssistantContext[]) => {
    const existing = byText.get(text);
    if (existing) existing.contexts = [...existing.contexts, ...contexts];
    else byText.set(text, { id: `d-${byText.size}`, text, active: true, contexts });
  };
  DEFAULT_PUBLIC_QUESTIONS.forEach((text) => add(text, ["expo", "catalogo", "portal"]));
  DEFAULT_ADMIN_QUESTIONS.forEach((text) => add(text, ["admin"]));
  return [...byText.values()];
}

const questionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  text: z.string().trim().min(3, "Cada pregunta necesita al menos 3 caracteres.").max(MAX_TEXT, `Máximo ${MAX_TEXT} caracteres por pregunta.`),
  active: z.boolean(),
  contexts: z.array(z.enum(ASSISTANT_CONTEXTS)).max(ASSISTANT_CONTEXTS.length),
});

const listSchema = z.array(questionSchema).max(MAX_QUESTIONS, `Máximo ${MAX_QUESTIONS} preguntas.`);

export type SuggestionsValidation = { ok: true; questions: SuggestedQuestion[] } | { ok: false; error: string };

export function validateQuestions(input: unknown): SuggestionsValidation {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá las preguntas." };
  const seen = new Set<string>();
  const questions: SuggestedQuestion[] = [];
  for (const q of parsed.data) {
    const key = q.text.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `La pregunta «${q.text}» está repetida.` };
    seen.add(key);
    questions.push({ ...q, contexts: [...new Set(q.contexts)] });
  }
  return { ok: true, questions };
}

/** Lo guardado, o null si no hay nada (o está roto): entonces valen las de siempre. */
export function parseQuestionsSetting(raw: string | null | undefined): SuggestedQuestion[] | null {
  if (!raw || !raw.trim()) return null;
  try {
    const result = validateQuestions(JSON.parse(raw));
    return result.ok ? result.questions : null;
  } catch {
    return null;
  }
}

/** Preguntas a mostrar en un contexto, en el orden cargado. */
export function questionsFor(saved: SuggestedQuestion[] | null, context: AssistantContext): string[] {
  if (!saved) return (context === "admin" ? DEFAULT_ADMIN_QUESTIONS : DEFAULT_PUBLIC_QUESTIONS).slice(0, MAX_SHOWN);
  return saved
    .filter((q) => q.active && (q.contexts.length === 0 || q.contexts.includes(context)))
    .map((q) => q.text)
    .slice(0, MAX_SHOWN);
}
