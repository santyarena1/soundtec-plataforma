"use client";

import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Recordatorio discreto dentro del flujo del chat. No es un modal y no
 * bloquea nada: el visitante puede ignorarlo y seguir preguntando.
 */
export function LeadReminderCard({
  onOpen,
  onDismiss,
}: {
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <aside className="ai-pop relative rounded-xl border border-accent/30 bg-accent/5 p-4">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar recordatorio"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">¿Necesitás más información?</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Podemos hacer que un asesor experto de Soundtec te contacte al finalizar la Expo.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onOpen}>
              Dejar mis datos
            </Button>
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
