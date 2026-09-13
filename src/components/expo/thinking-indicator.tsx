"use client";

import { useEffect, useState } from "react";

/**
 * Estado de "pensando". Los textos describen lo que realmente hace el
 * backend en esta fase (buscar productos y revisar fichas). No se menciona
 * documentación indexada porque todavía no se lee documentación.
 */
const STAGES = [
  "Buscando productos relacionados…",
  "Revisando especificaciones…",
  "Comparando alternativas…",
  "Armando la respuesta…",
];

export function ThinkingIndicator() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStage((current) => (current + 1) % STAGES.length);
    }, 1900);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="ai-enter flex items-center gap-3" role="status" aria-live="polite">
      <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-2">
        <span className="ai-dot h-1.5 w-1.5 rounded-full bg-foreground" />
        <span className="ai-dot h-1.5 w-1.5 rounded-full bg-foreground" />
        <span className="ai-dot h-1.5 w-1.5 rounded-full bg-foreground" />
      </span>
      <span className="ai-thinking-text text-sm font-medium">{STAGES[stage]}</span>
    </div>
  );
}
