"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";
import { createTicketQuick } from "@/server/actions/tickets";
import { getTour, resolveTourId, type TourDef } from "@/lib/help/tours";

type ReportContext = {
  title: string;
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
    setDescription("");
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

export function HelpDock() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paso = searchParams.get("paso");
  const autoTour = searchParams.get("tour") === "1";
  const tourId = useMemo(() => resolveTourId(pathname, paso), [pathname, paso]);
  const tour = useMemo(() => getTour(tourId), [tourId]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCtx, setReportCtx] = useState<ReportContext | null>(null);

  const startTour = useCallback(() => {
    if (!tour) {
      toast.message("No hay recorrido para esta pantalla", {
        description: "Abrí el tutorial o reportá el error si algo no anda.",
      });
      return;
    }
    setMenuOpen(false);
    setTourIndex(0);
  }, [tour]);

  useEffect(() => {
    setTourIndex(null);
    setMenuOpen(false);
  }, [pathname, paso]);

  useEffect(() => {
    if (!autoTour || !tour) return;
    setTourIndex(0);
  }, [autoTour, tour, pathname, paso]);

  function openReport(ctx?: ReportContext) {
    setReportCtx(ctx || { title: "", tourId: tour?.id });
    setMenuOpen(false);
    setReportOpen(true);
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[70] print:hidden">
        {menuOpen ? (
          <div className="mb-2 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">Ayuda</p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                aria-label="Cerrar menú de ayuda"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col p-1.5">
              <Link
                href="/admin/ayuda?v=simple"
                className="flex items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-secondary"
                onClick={() => setMenuOpen(false)}
              >
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">Tutorial simple</span>
                  <span className="block text-xs text-muted-foreground">El flujo en una página.</span>
                </span>
              </Link>
              <Link
                href="/admin/ayuda?v=detallado"
                className="flex items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-secondary"
                onClick={() => setMenuOpen(false)}
              >
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">Tutorial detallado</span>
                  <span className="block text-xs text-muted-foreground">Cada campo, qué se edita y qué no.</span>
                </span>
              </Link>
              <button
                type="button"
                className="flex items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-secondary disabled:opacity-50"
                onClick={startTour}
                disabled={!tour}
              >
                <Compass className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">Recorrer esta pantalla</span>
                  <span className="block text-xs text-muted-foreground">
                    {tour ? `Oscurece y señala: ${tour.title}.` : "Esta pantalla todavía no tiene recorrido."}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="flex items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-secondary"
                onClick={() => openReport()}
              >
                <Bug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">Reportar al dev</span>
                  <span className="block text-xs text-muted-foreground">Ticket rápido con la URL de ahora.</span>
                </span>
              </button>
            </div>
          </div>
        ) : null}
        <Button
          type="button"
          size="md"
          className="shadow-lg"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label="Abrir ayuda"
        >
          <CircleHelp className="h-4 w-4" />
          Ayuda
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

      <ReportModal open={reportOpen} context={reportCtx} onClose={() => setReportOpen(false)} />
    </>
  );
}
