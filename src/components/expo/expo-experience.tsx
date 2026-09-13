"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { ChatMessage } from "./chat-message";
import { Composer } from "./composer";
import { ContactForm } from "./contact-form";
import { LeadReminderCard } from "./lead-reminder-card";
import { ThinkingIndicator } from "./thinking-indicator";
import type { ChatApiResponse, ChatProduct, ChatTurn, LeadFormValues } from "./types";

const DEFAULT_SUGGESTIONS = [
  "¿Qué parlante sirve para exterior?",
  "¿Qué procesador Crestron necesito para 3 salas?",
  "Comparame dos amplificadores",
  "Busco una solución de audio para un restaurante",
];

function productSuggestions(product: ChatProduct): string[] {
  const name = product.name.split(" ").slice(0, 4).join(" ");
  return [
    `¿Dónde puedo instalar el ${name}?`,
    "¿Es apto para exterior?",
    "Ver especificaciones principales",
    "¿Con qué productos es compatible?",
  ];
}

let turnCounter = 0;
function nextTurnId(): string {
  turnCounter += 1;
  return `t${turnCounter}-${Date.now()}`;
}

export function ExpoExperience({
  initialProduct,
  logoUrl,
}: {
  initialProduct: ChatProduct | null;
  logoUrl: string;
}) {
  const [contactOpen, setContactOpen] = useState(true);
  const [contactPending, setContactPending] = useState(false);
  const [leadSaved, setLeadSaved] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  const suggestions = initialProduct ? productSuggestions(initialProduct) : DEFAULT_SUGGESTIONS;

  // Auto-scroll sólo si el visitante ya estaba abajo: si está leyendo una
  // respuesta anterior, no se lo arrastra.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !stickToBottom.current) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [turns, thinking]);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickToBottom.current = distance < 120;
  }, []);

  const send = useCallback(
    async (rawMessage: string) => {
      const message = rawMessage.trim();
      if (!message || thinking) return;

      stickToBottom.current = true;
      setDraft("");
      setTurns((current) => [...current, { id: nextTurnId(), role: "user", content: message }]);
      setThinking(true);

      try {
        const response = await fetch("/api/expo/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            sessionId,
            productId: initialProduct?.id ?? null,
            surface: "EXPO",
          }),
        });
        const data = (await response.json()) as ChatApiResponse;

        if (!data.ok || !data.answer) {
          setTurns((current) => [
            ...current,
            {
              id: nextTurnId(),
              role: "assistant",
              content:
                data.error ??
                "No pude consultar el asistente en este momento. Podés seguir usando el buscador del catálogo.",
              error: true,
            },
          ]);
          return;
        }

        if (data.sessionId) setSessionId(data.sessionId);
        setTurns((current) => [
          ...current,
          {
            id: nextTurnId(),
            role: "assistant",
            content: data.answer as string,
            status: data.status,
            confidence: data.confidence,
            products: data.products ?? [],
            sources: data.sources ?? [],
            suggestions: data.suggestions ?? [],
            reminder: Boolean(data.showLeadReminder) && !leadSaved,
          },
        ]);
      } catch {
        setTurns((current) => [
          ...current,
          {
            id: nextTurnId(),
            role: "assistant",
            content:
              "Se cortó la conexión. Probá de nuevo en unos segundos: el buscador del catálogo sigue disponible.",
            error: true,
          },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [initialProduct?.id, leadSaved, sessionId, thinking]
  );

  const saveLead = useCallback(
    async (values: LeadFormValues) => {
      setContactPending(true);
      try {
        const response = await fetch("/api/expo/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...values,
            sessionId,
            productId: initialProduct?.id ?? null,
          }),
        });
        const data = (await response.json()) as { ok: boolean; sessionId?: string; saved?: boolean };
        if (data.sessionId) setSessionId(data.sessionId);
        if (data.saved) setLeadSaved(true);
      } catch {
        // Dejar datos nunca puede bloquear el chat: si falla, se sigue igual.
      } finally {
        setContactPending(false);
        setContactOpen(false);
        setTurns((current) => current.map((turn) => ({ ...turn, reminder: false })));
      }
    },
    [initialProduct?.id, sessionId]
  );

  const dismissReminder = useCallback(async () => {
    setTurns((current) => current.map((turn) => ({ ...turn, reminder: false })));
    try {
      const response = await fetch("/api/expo/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, dismissed: true }),
      });
      const data = (await response.json()) as { sessionId?: string };
      if (data.sessionId) setSessionId(data.sessionId);
    } catch {
      // Sin consecuencias: el recordatorio ya se ocultó en pantalla.
    }
  }, [sessionId]);

  const empty = turns.length === 0;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Soundtec" className="h-7 w-auto shrink-0 object-contain sm:h-8" />
          <span className="hidden h-5 w-px bg-border sm:block" />
          <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
            Asistente técnico de productos
          </p>
        </div>
        <Link
          href="/catalogo"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Catálogo
        </Link>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-5"
      >
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {empty ? (
            <section className="ai-enter pt-6 text-center sm:pt-12">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Soundtec"
                className="ai-pop mx-auto h-12 w-auto object-contain sm:h-16"
              />
              <h1 className="heading-2 mt-5">Preguntanos sobre nuestros productos</h1>
              <p className="muted-text mx-auto mt-2 max-w-md">
                Podés consultar modelos, compatibilidad, aplicaciones o especificaciones. Respondo con la
                información técnica que tenemos documentada.
              </p>

              {initialProduct ? (
                <div className="ai-pop mx-auto mt-5 max-w-md rounded-xl border border-accent/30 bg-accent/5 p-3 text-left">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                    Estás consultando
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">{initialProduct.name}</p>
                  {initialProduct.brandName ? (
                    <p className="text-xs text-muted-foreground">{initialProduct.brandName}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="ai-stagger mx-auto mt-6 grid max-w-md gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition-all duration-200 hover:border-accent hover:shadow-card active:scale-[0.99]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {turns.map((turn) => (
            <div key={turn.id} className="space-y-3">
              <ChatMessage turn={turn} onSuggestion={(value) => void send(value)} />
              {turn.reminder && !leadSaved ? (
                <LeadReminderCard
                  onOpen={() => setContactOpen(true)}
                  onDismiss={() => void dismissReminder()}
                />
              ) : null}
            </div>
          ))}

          {thinking ? <ThinkingIndicator /> : null}
        </div>
      </div>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => void send(draft)}
        disabled={thinking}
        placeholder={initialProduct ? `Preguntá sobre ${initialProduct.name}…` : "Escribí tu consulta…"}
      />

      <Modal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        title="¿Querés que un asesor experto de Soundtec te contacte al finalizar la Expo?"
        description="Si estás evaluando un proyecto o necesitás más información, podés dejarnos tus datos. Todos los campos son opcionales."
        size="md"
      >
        <ContactForm
          pending={contactPending}
          submitLabel="Guardar y comenzar"
          skipLabel="Continuar sin dejar datos"
          onSubmit={(values) => void saveLead(values)}
          onSkip={() => setContactOpen(false)}
        />
      </Modal>
    </div>
  );
}
