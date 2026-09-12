"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Link2,
  Lightbulb,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  notifyOnboardingActive,
  notifyOnboardingInactive,
  ONBOARDING_START_EVENT,
} from "@/lib/onboarding/events";
import { tourForSurface } from "@/lib/onboarding/tours";
import type {
  OnboardingState,
  OnboardingStatus,
  OnboardingSurface,
  OnboardingSurfaceState,
} from "@/lib/onboarding/types";
import { resetOnboarding, saveOnboardingState } from "@/server/actions/onboarding";
import { toast } from "sonner";

type Phase = "idle" | "welcome" | "tour";

function surfaceState(state: OnboardingState, surface: OnboardingSurface): OnboardingSurfaceState {
  return state[surface] ?? { status: "pending" as OnboardingStatus };
}

function pathMatches(pathname: string, route: string) {
  if (route === "/admin" || route === "/portal") return pathname === route;
  return pathname === route || pathname.startsWith(`${route}/`);
}

function useTargetRect(target: string | null, active: boolean, pathname: string) {
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
    let detach: (() => void) | null = null;
    let attempts = 0;

    function attach(el: Element) {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      const update = () => {
        if (!cancelled) setRect(el.getBoundingClientRect());
      };
      update();
      window.addEventListener("resize", update);
      window.addEventListener("scroll", update, true);
      observer = new ResizeObserver(update);
      observer.observe(el);
      detach = () => {
        window.removeEventListener("resize", update);
        window.removeEventListener("scroll", update, true);
        observer?.disconnect();
      };
    }

    function tryFind() {
      if (cancelled) return;
      const found = document.querySelector(`[data-tour="${CSS.escape(target!)}"]`);
      if (found) {
        setMissing(false);
        attach(found);
        return;
      }
      attempts += 1;
      if (attempts >= 20) {
        setMissing(true);
        setRect(null);
        return;
      }
      window.setTimeout(tryFind, 100);
    }

    tryFind();
    return () => {
      cancelled = true;
      detach?.();
    };
  }, [target, active, pathname]);

  return { rect, missing };
}

function tooltipStyle(rect: DOMRect | null, centered: boolean) {
  const width = Math.min(420, typeof window === "undefined" ? 420 : window.innerWidth - 24);
  if (!rect || centered) {
    return {
      top: "50%",
      left: "50%",
      width,
      maxHeight: "min(70vh, 560px)",
      transform: "translate(-50%, -50%)",
    } as const;
  }
  const gap = 14;
  const approxH = 320;
  const below = rect.bottom + gap + approxH < window.innerHeight;
  const top = below ? rect.bottom + gap : Math.max(12, rect.top - gap - Math.min(approxH, Math.max(80, rect.top - 12)));
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  return { top, left, width, maxHeight: "min(70vh, 560px)", transform: undefined };
}

export function OnboardingHost({
  surface,
  initialState,
}: {
  surface: OnboardingSurface;
  initialState: OnboardingState;
}) {
  const tour = useMemo(() => tourForSurface(surface), [surface]);
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const bootstrapped = useRef(false);
  const autoAdvancedFor = useRef<string | null>(null);

  const step = tour.steps[stepIndex];
  const needsPath = Boolean(step?.requirePath && !pathMatches(pathname, step.requirePath));
  const { rect, missing } = useTargetRect(
    phase === "tour" ? step?.target ?? null : null,
    phase === "tour",
    pathname
  );

  const persist = useCallback(
    (input: {
      status: OnboardingStatus;
      stepIndex?: number;
      completedStepIds?: string[];
    }) => {
      start(async () => {
        await saveOnboardingState({
          surface,
          status: input.status,
          stepIndex: input.stepIndex,
          completedStepIds: input.completedStepIds,
        });
      });
    },
    [surface, start]
  );

  const openWelcome = useCallback(() => {
    setCompletedIds([]);
    setStepIndex(0);
    autoAdvancedFor.current = null;
    setPhase("welcome");
    notifyOnboardingActive();
  }, []);

  const startTour = useCallback(() => {
    setPhase("tour");
    setStepIndex(0);
    setCompletedIds([]);
    autoAdvancedFor.current = null;
    notifyOnboardingActive();
    persist({ status: "in_progress", stepIndex: 0, completedStepIds: [] });
  }, [persist]);

  const skipAll = useCallback(() => {
    setPhase("idle");
    notifyOnboardingInactive();
    persist({ status: "skipped", stepIndex: 0, completedStepIds: completedIds });
  }, [persist, completedIds]);

  const finish = useCallback(() => {
    const ids = Array.from(new Set([...completedIds, step?.id].filter(Boolean) as string[]));
    setCompletedIds(ids);
    setPhase("idle");
    notifyOnboardingInactive();
    persist({ status: "completed", stepIndex: tour.steps.length - 1, completedStepIds: ids });
  }, [completedIds, persist, step?.id, tour.steps.length]);

  const goToStep = useCallback(
    (nextIndex: number) => {
      if (!tour.steps[nextIndex]) return;
      setCompletedIds((prev) => {
        const ids = step && !prev.includes(step.id) ? [...prev, step.id] : prev;
        persist({ status: "in_progress", stepIndex: nextIndex, completedStepIds: ids });
        return ids;
      });
      setStepIndex(nextIndex);
    },
    [tour.steps, step, persist]
  );

  const restartFromScratch = useCallback(() => {
    openWelcome();
    start(async () => {
      try {
        await resetOnboarding(surface);
      } catch {
        toast.error("No se pudo guardar el reinicio", {
          description: "El tutorial se abrió igual; si recargás puede volver el estado anterior.",
        });
      }
    });
  }, [openWelcome, start, surface]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const current = surfaceState(initialState, surface);
    if (current.status === "pending") {
      setPhase("welcome");
      setStepIndex(0);
      notifyOnboardingActive();
      return;
    }
    if (current.status === "in_progress") {
      const idx = Math.min(current.stepIndex ?? 0, tour.steps.length - 1);
      setStepIndex(idx);
      setCompletedIds(current.completedStepIds ?? []);
      setPhase("tour");
      notifyOnboardingActive();
    }
  }, [initialState, surface, tour.steps.length]);

  useEffect(() => {
    function onStart() {
      restartFromScratch();
    }
    window.addEventListener(ONBOARDING_START_EVENT, onStart);
    return () => window.removeEventListener(ONBOARDING_START_EVENT, onStart);
  }, [restartFromScratch]);

  useEffect(() => {
    if (phase === "idle") notifyOnboardingInactive();
    else notifyOnboardingActive();
  }, [phase]);

  useEffect(() => {
    if (phase !== "tour" || !step?.requirePath || !step.autoAdvanceOnRoute) return;
    if (!pathMatches(pathname, step.requirePath)) return;
    if (autoAdvancedFor.current === step.id) return;
    if (stepIndex >= tour.steps.length - 1) return;
    autoAdvancedFor.current = step.id;
    goToStep(stepIndex + 1);
  }, [phase, step, pathname, stepIndex, tour.steps.length, goToStep]);

  useEffect(() => {
    if (phase !== "welcome" && phase !== "tour") return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") skipAll();
      if (phase !== "tour" || needsPath) return;
      if (event.key === "ArrowRight" && stepIndex < tour.steps.length - 1) goToStep(stepIndex + 1);
      if (event.key === "ArrowLeft" && stepIndex > 0) goToStep(stepIndex - 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, skipAll, goToStep, stepIndex, tour.steps.length, needsPath]);

  if (phase === "idle") return null;

  if (phase === "welcome") {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-welcome-title"
      >
        <div className="absolute inset-0 bg-[hsl(213_47%_10%/0.78)] backdrop-blur-[2px]" />
        <div
          className="relative z-[101] w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 120% 80% at 0% 0%, hsl(213 47% 22% / 0.12), transparent 55%), radial-gradient(ellipse 90% 70% at 100% 100%, hsl(32 70% 48% / 0.08), transparent 50%)",
          }}
        >
          <div className="relative p-6 sm:p-8">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Tutorial guiado
            </div>
            <h2 id="onboarding-welcome-title" className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
              {tour.welcomeTitle}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{tour.welcomeBody}</p>
            <ul className="mt-5 space-y-2.5 text-sm text-foreground/90">
              <li className="flex items-start gap-2.5">
                <Compass className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Te mostramos qué clickear; los cambios de pantalla los hacés vos desde el menú.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>En cada módulo vemos cómo crear, qué opciones hay y qué consecuencias tienen.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Podés salir cuando quieras y reiniciar desde Ayuda → Empezar guía de nuevo.</span>
              </li>
            </ul>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <Button type="button" size="lg" onClick={startTour} disabled={pending} className="gap-2">
                Empezar el tutorial
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button type="button" size="lg" variant="ghost" onClick={skipAll} disabled={pending}>
                Ahora no
              </Button>
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">
              {tour.steps.length} pasos · tomate el tiempo que necesites
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!step) return null;

  const pad = 8;
  const highlight =
    rect && !needsPath
      ? {
          top: Math.max(4, rect.top - pad),
          left: Math.max(4, rect.left - pad),
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }
      : null;

  const paragraphs = step.body.split("\n\n").filter(Boolean);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={tour.title}
    >
      <div className="absolute inset-0 bg-[hsl(213_47%_8%/0.45)]" />
      {highlight ? (
        <div
          className="absolute z-[101] rounded-lg transition-all duration-300"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            boxShadow: "0 0 0 9999px hsl(213 47% 8% / 0.45), 0 0 0 2px hsl(213 47% 92%)",
          }}
        />
      ) : null}

      <div
        className="pointer-events-auto absolute z-[102] flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        style={tooltipStyle(rect, needsPath || !step.target)}
      >
        <div className="h-1 shrink-0 bg-secondary" aria-hidden>
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / tour.steps.length) * 100}%` }}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {tour.title} · {stepIndex + 1}/{tour.steps.length}
              </p>
              <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
            </div>
            <button
              type="button"
              onClick={skipAll}
              aria-label="Cerrar tutorial"
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {needsPath ? (
            <div className="space-y-3">
              <p className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-sm text-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <span>
                  <span className="font-medium">Tu turno: </span>
                  abrí esta pantalla desde el menú. El tutorial espera a que llegues.
                </span>
              </p>
              {paragraphs.map((p) => (
                <p key={p.slice(0, 40)} className="text-sm leading-relaxed text-foreground">
                  {p}
                </p>
              ))}
              {step.tip ? (
                <p className="flex gap-2 rounded-md bg-secondary/80 px-2.5 py-2 text-xs text-muted-foreground">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{step.tip}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <>
              {paragraphs.map((p) => (
                <p key={p.slice(0, 40)} className="text-sm leading-relaxed text-foreground">
                  {p}
                </p>
              ))}
              {step.bullets?.length ? (
                <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-foreground/90">
                  {step.bullets.map((b) => (
                    <li key={b.slice(0, 40)}>{b}</li>
                  ))}
                </ul>
              ) : null}
              {step.tip ? (
                <p className="mt-2.5 flex gap-2 rounded-md bg-secondary/80 px-2.5 py-2 text-xs text-muted-foreground">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>
                    <span className="font-medium text-foreground">Tip: </span>
                    {step.tip}
                  </span>
                </p>
              ) : null}
              {step.affects ? (
                <p className="mt-2 flex gap-2 rounded-md border border-primary/15 bg-primary/[0.04] px-2.5 py-2 text-xs text-muted-foreground">
                  <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>
                    <span className="font-medium text-foreground">Impacto: </span>
                    {step.affects}
                  </span>
                </p>
              ) : null}
              {missing && step.target ? (
                <p className="mt-2 text-xs text-amber-700">
                  No encontramos el control resaltado en esta vista. Podés seguir con Siguiente o abrir la sección desde el menú.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={skipAll}>
            Salir del tutorial
          </button>
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="outline" disabled={stepIndex === 0} onClick={() => goToStep(stepIndex - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Atrás
            </Button>
            {stepIndex < tour.steps.length - 1 ? (
              <Button type="button" size="sm" disabled={needsPath} onClick={() => goToStep(stepIndex + 1)}>
                Siguiente
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={needsPath} onClick={finish}>
                Listo
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
