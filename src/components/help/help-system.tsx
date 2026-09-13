"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  Bug,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Compass,
  Loader2,
  Package,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";
import { createTicketQuick } from "@/server/actions/tickets";
import { askHelpChat } from "@/server/actions/help-chat";
import { RichAnswer } from "@/components/expo/rich-answer";
import { moduleForPath } from "@/lib/help/modules";
import { resolveTour, type TourDef } from "@/lib/help/tours";
import { requestOnboardingStart } from "@/lib/onboarding/events";

type ReportContext = {
  title: string;
  description?: string;
  tourId?: string;
  tourStep?: string;
  tourTarget?: string;
};

function useTargetRect(target: string | null, active: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!active || !target) {
      setRect(null);
      setMissing(false);
      return;
    }

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let element: Element | null = null;

    function attach(el: Element) {
      element = el;
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      const update = () => {
        if (!cancelled) setRect(el.getBoundingClientRect());
      };
      update();
      window.addEventListener("resize", update);
      window.addEventListener("scroll", update, true);
      observer = new ResizeObserver(update);
      observer.observe(el);
      return () => {
        window.removeEventListener("resize", update);
        window.removeEventListener("scroll", update, true);
        observer?.disconnect();
      };
    }

    const found = document.querySelector(`[data-tour="${CSS.escape(target)}"]`);
    if (found) {
      setMissing(false);
      const detach = attach(found);
      return () => {
        cancelled = true;
        detach();
      };
    }

    setMissing(true);
    setRect(null);
    const timer = window.setTimeout(() => {
      const later = document.querySelector(`[data-tour="${CSS.escape(target)}"]`);
      if (!later || cancelled) return;
      setMissing(false);
      attach(later);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [target, active]);

  return { rect, missing };
}

function tooltipStyle(rect: DOMRect | null) {
  const width = Math.min(380, typeof window === "undefined" ? 380 : window.innerWidth - 24);
  if (!rect) {
    return {
      top: "50%",
      left: "50%",
      width,
      transform: "translate(-50%, -50%)",
    } as const;
  }
  const gap = 14;
  const below = rect.bottom + gap + 220 < window.innerHeight;
  const top = below ? rect.bottom + gap : Math.max(12, rect.top - gap - 220);
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  return { top, left, width, transform: undefined };
}

function TourOverlay({
  tour,
  index,
  onIndex,
  onClose,
  onReport,
}: {
  tour: TourDef;
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
  onReport: (ctx: ReportContext) => void;
}) {
  const step = tour.steps[index];
  const { rect, missing } = useTargetRect(step?.target ?? null, Boolean(step));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && index < tour.steps.length - 1) onIndex(index + 1);
      if (event.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [index, onClose, onIndex, tour.steps.length]);

  if (!step) return null;

  const pad = 8;
  const highlight = rect
    ? {
        top: Math.max(4, rect.top - pad),
        left: Math.max(4, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  return (
    <div className="fixed inset-0 z-[80] print:hidden" role="dialog" aria-modal="true" aria-label={tour.title}>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      {highlight ? (
        <div
          className="pointer-events-none absolute z-[81] rounded-lg ring-2 ring-white ring-offset-2 ring-offset-black/40"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      ) : null}

      <div
        className="absolute z-[82] rounded-xl border border-border bg-card p-4 shadow-2xl"
        style={tooltipStyle(rect)}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {tour.title} · {index + 1}/{tour.steps.length}
            </p>
            <h3 className="text-sm font-semibold">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar recorrido"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-foreground">{step.body}</p>
        {step.editable ? (
          <p className="mt-2 rounded-md bg-secondary/80 px-2 py-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Se edita: </span>
            {step.editable}
          </p>
        ) : null}
        {missing ? (
          <p className="mt-2 text-xs text-amber-700">
            Este control no está visible ahora (puede faltar un permiso, estar en otro paso o la COT emitida).
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() =>
              onReport({
                title: `No funciona: ${step.title}`,
                tourId: tour.id,
                tourStep: step.title,
                tourTarget: step.target,
              })
            }
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Esto no funciona
          </Button>
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => onIndex(index - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Atrás
            </Button>
            {index < tour.steps.length - 1 ? (
              <Button type="button" size="sm" onClick={() => onIndex(index + 1)}>
                Siguiente
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={onClose}>
                Listo
              </Button>
            )}
          </div>
        </div>
        <button type="button" className="mt-2 text-[11px] text-muted-foreground hover:underline" onClick={onClose}>
          Saltar recorrido
        </button>
      </div>
    </div>
  );
}

function ReportModal({
  open,
  context,
  onClose,
}: {
  open: boolean;
  context: ReportContext | null;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setTitle(context?.title || "");
    setDescription(context?.description || "");
  }, [open, context]);

  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onClose}
      title="Reportar al desarrollador"
      description="Se manda la pantalla, la URL y lo que escribas. Aparece en Admin → Tickets al dev."
      icon={<Bug className="h-4 w-4" />}
      size="md"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={pending || title.trim().length < 3 || description.trim().length < 5}
            onClick={() =>
              start(async () => {
                const result = await createTicketQuick({
                  title: title.trim(),
                  description: description.trim(),
                  pathname,
                  url: typeof window !== "undefined" ? window.location.href : pathname,
                  tourId: context?.tourId,
                  tourStep: context?.tourStep,
                  tourTarget: context?.tourTarget,
                  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
                  priority: "HIGH",
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Ticket enviado", {
                  description: "Quedó en Tickets al dev con la pantalla y el paso del recorrido.",
                });
                onClose();
              })
            }
          >
            Enviar ticket
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-md bg-secondary/70 px-3 py-2 text-xs text-muted-foreground">
          {pathname}
          {context?.tourStep ? ` · ${context.tourStep}` : ""}
        </p>
        <div>
          <Label htmlFor="help-ticket-title" required>
            Qué falló
          </Label>
          <Input
            id="help-ticket-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. No se guarda la clasificación"
          />
        </div>
        <div>
          <Label htmlFor="help-ticket-body" required>
            Qué hiciste y qué esperabas
          </Label>
          <Textarea
            id="help-ticket-body"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Pasos, mensaje de error, si es de esta COT o de todas…"
          />
        </div>
      </div>
    </Modal>
  );
}

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  /** Solo en la pestaña de productos: las tarjetas que acompañan la respuesta. */
  products?: Array<{ id: string; name: string; href: string; reason?: string }>;
};

/** Las dos cosas distintas que se pueden preguntar desde el mismo botón. */
type DockTab = "sistema" | "productos";

const PRODUCT_WELCOME: ChatMsg = {
  role: "assistant",
  content:
    "Preguntame por el catálogo: un modelo puntual, una especificación, qué productos cumplen una condición o qué le conviene a un cliente. Respondo solo con fichas de Soundtec, y desde acá también veo costo y stock.",
};

const PRODUCT_EXAMPLES = [
  "¿Qué parlantes tienen para exterior?",
  "¿Qué productos son compatibles con Crestron Home?",
  "Necesito parlantes para un restaurante",
];

function welcomeFor(pathname: string): ChatMsg {
  const mod = moduleForPath(pathname);
  return {
    role: "assistant",
    content: `Estás en ${mod.title}. ${mod.simple}\n\nPreguntame cualquier campo, pedime recorrer la pantalla o decime si algo no anda y armo el ticket al dev.`,
  };
}

export function HelpDock() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paso = searchParams.get("paso");
  const autoTour = searchParams.get("tour") === "1";
  const tour = useMemo(() => resolveTour(pathname, paso), [pathname, paso]);
  const screen = useMemo(() => moduleForPath(pathname), [pathname]);

  const [open, setOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCtx, setReportCtx] = useState<ReportContext | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>(() => [welcomeFor("/admin")]);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [suggestTicket, setSuggestTicket] = useState(false);
  const [tab, setTab] = useState<DockTab>("sistema");
  const [productMessages, setProductMessages] = useState<ChatMsg[]>(() => [PRODUCT_WELCOME]);
  const [productSessionId, setProductSessionId] = useState<string | null>(null);
  const [productPending, setProductPending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const startTour = useCallback(() => {
    if (!tour) return;
    setOpen(false);
    setTourIndex(0);
  }, [tour]);

  useEffect(() => {
    setTourIndex(null);
  }, [pathname, paso]);

  useEffect(() => {
    if (!autoTour || !tour) return;
    setTourIndex(0);
  }, [autoTour, tour, pathname, paso]);

  useEffect(() => {
    setMessages((prev) => (prev.length <= 1 ? [welcomeFor(pathname)] : prev));
  }, [pathname]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, productMessages, open, tab]);

  function openReport(ctx?: ReportContext) {
    const lastUser = [...messages].reverse().find((msg) => msg.role === "user");
    const lastAssistant = [...messages].reverse().find((msg) => msg.role === "assistant");
    setReportCtx({
      title: ctx?.title || (lastUser ? lastUser.content.slice(0, 80) : ""),
      description:
        ctx?.description ||
        [lastUser ? `El usuario dijo: ${lastUser.content}` : "", lastAssistant ? `El asistente: ${lastAssistant.content}` : ""]
          .filter(Boolean)
          .join("\n\n"),
      tourId: ctx?.tourId || tour?.id,
      tourStep: ctx?.tourStep,
      tourTarget: ctx?.tourTarget,
    });
    setOpen(false);
    setReportOpen(true);
  }

  function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    const next = [...messages, { role: "user" as const, content: message }];
    setMessages(next);
    setDraft("");
    start(async () => {
      const result = await askHelpChat({
        message,
        pathname,
        history: next.slice(-10).map((msg) => ({ role: msg.role, content: msg.content })),
      });
      if (!result.ok) {
        toast.error(result.error);
        setMessages((prev) => [...prev, { role: "assistant", content: result.error }]);
        return;
      }
      setSuggestTicket(result.suggestTicket);
      setMessages((prev) => [...prev, { role: "assistant", content: result.answer }]);
    });
  }

  /**
   * Asistente de productos dentro del mismo dock. Usa la ruta del admin, así
   * que responde con el catálogo completo y, para el equipo, con costo y stock.
   */
  async function sendProduct(text: string) {
    const message = text.trim();
    if (!message || productPending) return;
    setProductMessages((prev) => [...prev, { role: "user", content: message }]);
    setDraft("");
    setProductPending(true);
    try {
      const response = await fetch("/api/admin/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId: productSessionId }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        sessionId?: string;
        answer?: string;
        products?: Array<{ id: string; name: string; href: string; reason?: string }>;
      };
      if (!data.ok || !data.answer) {
        const error = data.error ?? "No pude consultar el catálogo en este momento.";
        setProductMessages((prev) => [...prev, { role: "assistant", content: error }]);
        return;
      }
      if (data.sessionId) setProductSessionId(data.sessionId);
      setProductMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer as string, products: data.products ?? [] },
      ]);
    } catch {
      setProductMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Se cortó la conexión. Probá de nuevo en unos segundos." },
      ]);
    } finally {
      setProductPending(false);
    }
  }

  const onProducts = tab === "productos";
  const activeMessages = onProducts ? productMessages : messages;
  const activePending = onProducts ? productPending : pending;
  const submit = (text: string) => (onProducts ? void sendProduct(text) : send(text));

  return (
    <>
      <div
        className="fixed z-[70] print:hidden"
        data-tour="help-dock"
        style={{
          right: "max(0.75rem, env(safe-area-inset-right))",
          bottom: "max(0.75rem, env(safe-area-inset-bottom))",
        }}
      >
        {open ? (
          <div className="mb-2 flex h-[min(560px,calc(100dvh-5.5rem))] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{onProducts ? "Asistente de productos" : "Asistente de ayuda"}</p>
                <p className="text-[11px] text-muted-foreground">{onProducts ? "Catálogo de Soundtec" : screen.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                aria-label="Cerrar ayuda"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-1 border-b border-border px-2 py-1.5">
              {([
                { key: "sistema" as const, label: "Usar el sistema", icon: CircleHelp },
                { key: "productos" as const, label: "Productos", icon: Package },
              ]).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  aria-pressed={tab === item.key}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors ${
                    tab === item.key
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </div>

            {onProducts ? (
              <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5">
                {PRODUCT_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-secondary"
                    onClick={() => void sendProduct(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            ) : (
              <>
              <div className="space-y-1.5 border-b border-border px-2 py-1.5">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
                  onClick={() => {
                    setOpen(false);
                    requestOnboardingStart();
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Empezar guía de nuevo
                </button>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-secondary"
                    onClick={() => send("¿Qué hace esta pantalla y qué se puede editar?")}
                  >
                    Esta pantalla
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-secondary"
                    onClick={startTour}
                  >
                    <Compass className="h-3 w-3" />
                    Recorrer
                  </button>
                  <Link
                    href="/admin/ayuda?v=detallado"
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-secondary"
                    onClick={() => setOpen(false)}
                  >
                    <BookOpen className="h-3 w-3" />
                    Tutorial
                  </Link>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-secondary"
                    onClick={() => openReport()}
                  >
                    <Bug className="h-3 w-3" />
                    Ticket al dev
                  </button>
                </div>
              </div>
              </>
            )}

            <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {activeMessages.map((msg, index) => (
                <div key={`${msg.role}-${index}`}>
                  <div
                    className={`max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    {msg.role === "assistant" && onProducts ? <RichAnswer text={msg.content} /> : msg.content}
                  </div>
                  {msg.products && msg.products.length > 0 ? (
                    <ul className="mt-1.5 max-w-[92%] space-y-1">
                      {msg.products.map((product) => (
                        <li key={product.id}>
                          <Link
                            href={product.href}
                            onClick={() => setOpen(false)}
                            className="block rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
                          >
                            <span className="font-medium">{product.name}</span>
                            {product.reason ? (
                              <span className="block text-[11px] text-muted-foreground">{product.reason}</span>
                            ) : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
              {activePending ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {onProducts ? "Buscando en el catálogo…" : "Leyendo la documentación…"}
                </p>
              ) : null}
              {suggestTicket && !onProducts ? (
                <Button type="button" size="sm" variant="outline" onClick={() => openReport({ title: "Error en pantalla" })}>
                  <Bug className="h-3.5 w-3.5" />
                  Crear ticket con esta conversación
                </Button>
              ) : null}
            </div>

            <form
              className="flex items-end gap-2 border-t border-border p-2"
              onSubmit={(event) => {
                event.preventDefault();
                submit(draft);
              }}
            >
              <Textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={onProducts ? "Preguntá por un modelo, una spec o qué necesita un cliente…" : "Preguntá por un campo, un flujo o un error…"}
                className="min-h-[44px] resize-none text-sm"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit(draft);
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={activePending || draft.trim().length < 2} aria-label="Enviar">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        ) : null}
        <Button
          type="button"
          size="md"
          className="shadow-lg"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Abrir ayuda"
        >
          <CircleHelp className="h-4 w-4" />
          Ayuda y productos
        </Button>
      </div>

      {tour && tourIndex !== null ? (
        <TourOverlay
          tour={tour}
          index={tourIndex}
          onIndex={setTourIndex}
          onClose={() => setTourIndex(null)}
          onReport={(ctx) => {
            setTourIndex(null);
            openReport(ctx);
          }}
        />
      ) : null}

      <ReportModal
        open={reportOpen}
        context={
          reportCtx
            ? {
                ...reportCtx,
                title: reportCtx.title,
              }
            : null
        }
        onClose={() => setReportOpen(false)}
      />
    </>
  );
}
