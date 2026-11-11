"use client";

import { useEffect, useRef } from "react";
import { UserRound } from "lucide-react";
import { BLOCK_LABELS, CONTENT_TYPES, QUESTION_TYPES, type BlockType } from "@/lib/forms/types";
import { ICONS } from "./screens";

/**
 * Menú para elegir qué agregar. Para una pantalla nueva ofrece todo (y el atajo de
 * datos de contacto); para sumar un campo a una pantalla, solo preguntas y texto.
 */
export function TypeMenu({
  mode,
  onPick,
  onContact,
  onClose,
}: {
  mode: "screen" | "field";
  onPick: (type: BlockType) => void;
  onContact?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const types: BlockType[] = mode === "screen" ? [...QUESTION_TYPES, ...CONTENT_TYPES] : [...QUESTION_TYPES, "statement"];
  return (
    <div ref={ref} className="absolute left-0 right-0 z-30 mt-2 max-h-[60vh] min-w-[18rem] overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-xl">
      {mode === "screen" && onContact ? (
        <button type="button" onClick={onContact} className="mb-1 flex w-full items-start gap-2.5 rounded-lg bg-primary/5 px-2.5 py-2 text-left hover:bg-primary/10">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-semibold">Datos de contacto</span>
            <span className="block text-[11px] text-muted-foreground">Nombre, cargo, email, celular y empresa en una sola pantalla</span>
          </span>
        </button>
      ) : null}
      {(["Preguntas", "Opciones", "Contenido"] as const).map((group) => {
        const list = types.filter((t) => BLOCK_LABELS[t].group === group);
        if (!list.length) return null;
        return (
          <div key={group} className="mb-1">
            <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
            {list.map((t) => {
              const Icon = ICONS[t];
              return (
                <button key={t} type="button" onClick={() => onPick(t)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-secondary">
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm font-medium">{mode === "field" && t === "statement" ? "Texto" : BLOCK_LABELS[t].label}</span>
                  <span className="ml-auto truncate text-[11px] text-muted-foreground">{BLOCK_LABELS[t].hint}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
