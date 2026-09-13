"use client";

import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_CHARS = 500;

/**
 * Campo de escritura. Fijo abajo, con safe-area para iPhone y altura
 * automática para que el teclado no tape lo que se escribe.
 */
export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 140)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <form
      className="ai-safe-bottom border-t border-border bg-background/95 px-4 pt-3 backdrop-blur"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-card focus-within:border-accent">
        <label htmlFor="expo-composer" className="sr-only">
          Escribí tu consulta
        </label>
        <textarea
          id="expo-composer"
          ref={ref}
          rows={1}
          value={value}
          maxLength={MAX_CHARS}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
          className="max-h-[140px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-base leading-snug text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Enviar consulta"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
            canSend
              ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-95"
              : "bg-secondary text-muted-foreground"
          )}
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-muted-foreground">
        Respondo con la información técnica del catálogo de Soundtec.
      </p>
    </form>
  );
}
