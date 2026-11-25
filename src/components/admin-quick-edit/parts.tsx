"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SaveFeedback = { tone: "ok" | "error" | "info"; text: string } | null;

/** Encabezado de una sección dentro de una pestaña. */
export function SectionHead({ title, hint, aside }: { title: string; hint?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-foreground">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {aside}
    </div>
  );
}

/**
 * Barra de guardado de una sección: dice si hay cambios, guarda y muestra el
 * resultado. Queda pegada abajo del panel mientras se edita esa sección.
 */
export function SaveBar({
  dirty,
  pending,
  feedback,
  onSave,
  onDiscard,
  label,
  summary,
}: {
  dirty: boolean;
  pending: boolean;
  feedback: SaveFeedback;
  onSave: () => void;
  onDiscard?: () => void;
  label: string;
  summary?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "-mx-5 mt-5 border-t px-5 py-3 backdrop-blur transition-colors",
        // Pegada abajo solo mientras hay algo para guardar (o el resultado de guardar).
        dirty || feedback ? "sticky bottom-0 z-10" : "",
        dirty ? "border-accent/30 bg-accent/[0.08]" : "border-border bg-card/95"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-xs" aria-live="polite">
          {feedback ? <FeedbackLine feedback={feedback} /> : dirty ? <span className="font-medium text-accent">Cambios sin guardar{summary ? " · " : ""}</span> : <span className="text-muted-foreground">Sin cambios</span>}
          {!feedback && dirty && summary ? <span className="text-muted-foreground">{summary}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {onDiscard && dirty ? (
            <Button variant="ghost" size="sm" onClick={onDiscard} disabled={pending}>
              Descartar
            </Button>
          ) : null}
          <Button size="sm" onClick={onSave} disabled={!dirty || pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {label}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackLine({ feedback }: { feedback: NonNullable<SaveFeedback> }) {
  const Icon = feedback.tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <span className={cn("inline-flex items-start gap-1.5", feedback.tone === "error" ? "text-destructive" : feedback.tone === "ok" ? "text-success" : "text-foreground")}>
      <Icon className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{feedback.text}</span>
    </span>
  );
}

/** El aviso de guardado se va solo a los pocos segundos (los errores quedan). */
export function useFeedback(): [SaveFeedback, (f: SaveFeedback) => void] {
  const [feedback, setFeedback] = useState<SaveFeedback>(null);
  useEffect(() => {
    if (!feedback || feedback.tone === "error") return;
    const timer = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(timer);
  }, [feedback]);
  return [feedback, setFeedback];
}

/** Fila de lista editable con mover arriba/abajo y quitar. */
export function RowTools({ index, count, onMove, onRemove, label }: { index: number; count: number; onMove: (from: number, to: number) => void; onRemove: () => void; label: string }) {
  const btn = "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" className={btn} disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Subir ${label}`} title="Subir">
        ↑
      </button>
      <button type="button" className={btn} disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label={`Bajar ${label}`} title="Bajar">
        ↓
      </button>
      <button type="button" className={cn(btn, "hover:text-destructive")} onClick={onRemove} aria-label={`Quitar ${label}`} title="Quitar">
        ×
      </button>
    </div>
  );
}

export function moveInList<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Contador de caracteres discreto. */
export function CharCount({ value, max }: { value: string; max: number }) {
  const near = value.length > max * 0.9;
  return <span className={cn("text-[11px] tabular-nums", value.length > max ? "text-destructive" : near ? "text-warning" : "text-muted-foreground")}>{value.length}/{max}</span>;
}
