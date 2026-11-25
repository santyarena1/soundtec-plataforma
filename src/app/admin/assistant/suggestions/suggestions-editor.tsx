"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { moveItem } from "@/lib/product-media";
import {
  ASSISTANT_CONTEXTS,
  CONTEXT_LABEL,
  MAX_QUESTIONS,
  MAX_SHOWN,
  MAX_TEXT,
  questionsFor,
  validateQuestions,
  type AssistantContext,
  type SuggestedQuestion,
} from "@/lib/assistant-suggestions";
import { resetSuggestedQuestionsAction, saveSuggestedQuestionsAction } from "@/server/actions/assistant-suggestions";

function newId(): string {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Editor de las preguntas sugeridas del asistente: agregar, editar, ordenar,
 * prender/apagar y elegir en qué pantallas aparece cada una.
 */
export function SuggestionsEditor({ initial, usingDefaults }: { initial: SuggestedQuestion[]; usingDefaults: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<SuggestedQuestion[]>(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  function change(next: SuggestedQuestion[]) {
    setItems(next);
    setDirty(true);
    setMessage(null);
  }

  function patchItem(id: string, patch: Partial<SuggestedQuestion>) {
    change(items.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function toggleContext(q: SuggestedQuestion, context: AssistantContext) {
    const has = q.contexts.includes(context);
    patchItem(q.id, { contexts: has ? q.contexts.filter((c) => c !== context) : [...q.contexts, context] });
  }

  function save() {
    const valid = validateQuestions(items.filter((q) => q.text.trim()));
    if (!valid.ok) return setMessage({ ok: false, text: valid.error });
    start(async () => {
      const result = await saveSuggestedQuestionsAction(valid.questions);
      if (!result.ok) return setMessage({ ok: false, text: result.error });
      setItems(valid.questions);
      setDirty(false);
      setMessage({ ok: true, text: "Guardado. El asistente ya muestra estas preguntas." });
      router.refresh();
    });
  }

  function reset() {
    if (!window.confirm("¿Volver a las preguntas de siempre? Se borra lo cargado acá.")) return;
    start(async () => {
      const result = await resetSuggestedQuestionsAction();
      if (!result.ok) return setMessage({ ok: false, text: result.error });
      setDirty(false);
      setMessage({ ok: true, text: "Listo: se usan las preguntas de siempre." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Aparecen como botones antes de que la persona escriba. Se muestran hasta {MAX_SHOWN} por pantalla, en este orden. Sin pantallas marcadas, la
            pregunta va en todas.
          </p>
          {usingDefaults && !dirty ? <Badge tone="muted">Usando las de siempre</Badge> : null}
        </div>

        <ol className="mt-4 space-y-2">
          {items.map((q, index) => (
            <li key={q.id} className={`rounded-lg border p-3 ${q.active ? "border-border" : "border-dashed border-border bg-secondary/30"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <Input
                  aria-label={`Pregunta ${index + 1}`}
                  className="min-w-[14rem] flex-1"
                  maxLength={MAX_TEXT}
                  value={q.text}
                  onChange={(e) => patchItem(q.id, { text: e.target.value })}
                  placeholder="¿Qué parlantes tienen para exterior?"
                />
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={q.active} onChange={(e) => patchItem(q.id, { active: e.target.checked })} />
                  Activa
                </label>
                <span className="flex">
                  <button
                    type="button"
                    onClick={() => change(moveItem(items, index, index - 1))}
                    disabled={index === 0}
                    className="rounded p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                    aria-label={`Subir pregunta ${index + 1}`}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => change(moveItem(items, index, index + 1))}
                    disabled={index === items.length - 1}
                    className="rounded p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                    aria-label={`Bajar pregunta ${index + 1}`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => change(items.filter((x) => x.id !== q.id))}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Quitar pregunta ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </div>
              <fieldset className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-7 text-xs">
                <legend className="sr-only">Pantallas donde aparece la pregunta {index + 1}</legend>
                <span className="text-muted-foreground">Dónde:</span>
                {ASSISTANT_CONTEXTS.map((context) => (
                  <label key={context} className="flex items-center gap-1">
                    <input type="checkbox" checked={q.contexts.includes(context)} onChange={() => toggleContext(q, context)} />
                    {CONTEXT_LABEL[context]}
                  </label>
                ))}
                {q.contexts.length === 0 ? <span className="text-muted-foreground">(todas)</span> : null}
              </fieldset>
            </li>
          ))}
        </ol>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={items.length >= MAX_QUESTIONS}
            onClick={() => change([...items, { id: newId(), text: "", active: true, contexts: [] }])}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar pregunta
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold">Así queda en cada pantalla</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ASSISTANT_CONTEXTS.map((context) => {
            const shown = questionsFor(items.filter((q) => q.text.trim()), context);
            return (
              <div key={context} className="rounded-lg bg-secondary/40 p-3">
                <p className="text-xs font-semibold">{CONTEXT_LABEL[context]}</p>
                {shown.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {shown.map((text) => (
                      <li key={text} className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px]">
                        {text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">Sin preguntas: no se muestra ningún botón.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save} disabled={pending || !dirty}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Guardar preguntas
        </Button>
        {!usingDefaults ? (
          <Button type="button" variant="ghost" onClick={reset} disabled={pending}>
            <RotateCcw className="h-4 w-4" /> Volver a las de siempre
          </Button>
        ) : null}
        {message ? (
          <p className={`flex items-center gap-1 text-xs ${message.ok ? "text-success" : "text-destructive"}`} role="status">
            {message.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />} {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
