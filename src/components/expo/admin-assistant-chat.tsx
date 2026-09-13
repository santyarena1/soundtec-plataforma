"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChatMessage } from "./chat-message";
import { Composer } from "./composer";
import { ThinkingIndicator } from "./thinking-indicator";
import type { ChatApiResponse, ChatTurn } from "./types";

const SUGGESTIONS = [
  "¿Qué parlantes tenemos con protección IP66?",
  "Dame 5 opciones de parlantes para exterior",
  "¿Qué amplificadores Sonance tenemos?",
  "¿Qué productos son compatibles con Crestron Home?",
];

let counter = 0;
function nextId(): string {
  counter += 1;
  return `a${counter}-${Date.now()}`;
}

/**
 * Mismo asistente, scope admin: el contexto puede incluir costo base y stock
 * porque la ruta exige sesión de administrador.
 */
export function AdminAssistantChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !stick.current) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [turns, thinking]);

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || thinking) return;
      stick.current = true;
      setDraft("");
      setTurns((current) => [...current, { id: nextId(), role: "user", content: message }]);
      setThinking(true);
      try {
        const response = await fetch("/api/admin/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, sessionId }),
        });
        const data = (await response.json()) as ChatApiResponse;
        if (!data.ok || !data.answer) {
          setTurns((current) => [
            ...current,
            {
              id: nextId(),
              role: "assistant",
              content: data.error ?? "No se pudo consultar el asistente.",
              error: true,
            },
          ]);
          return;
        }
        if (data.sessionId) setSessionId(data.sessionId);
        setTurns((current) => [
          ...current,
          {
            id: nextId(),
            role: "assistant",
            content: data.answer as string,
            status: data.status,
            confidence: data.confidence,
            products: data.products ?? [],
            sources: data.sources ?? [],
            suggestions: data.suggestions ?? [],
          },
        ]);
      } catch {
        setTurns((current) => [
          ...current,
          { id: nextId(), role: "assistant", content: "Se cortó la conexión con el asistente.", error: true },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [sessionId, thinking]
  );

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex h-[70vh] flex-col p-0">
        <div
          ref={scrollRef}
          onScroll={() => {
            const node = scrollRef.current;
            if (!node) return;
            stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
          }}
          className="flex-1 space-y-4 overflow-y-auto p-5"
        >
          {turns.length === 0 ? (
            <div className="ai-stagger grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm transition-all duration-200 hover:border-accent hover:shadow-card"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
          {turns.map((turn) => (
            <ChatMessage key={turn.id} turn={turn} onSuggestion={(value) => void send(value)} />
          ))}
          {thinking ? <ThinkingIndicator /> : null}
        </div>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => void send(draft)}
          disabled={thinking}
          placeholder="Consultá el catálogo: modelos, specs, compatibilidad…"
        />
      </CardContent>
    </Card>
  );
}
