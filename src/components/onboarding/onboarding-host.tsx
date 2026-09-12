"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Link2,
  Lightbulb,
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

function routeMatches(pathname: string, route: string) {
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
    let detachListeners: (() => void) | null = null;
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
      detachListeners = () => {
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
      if (attempts >= 12) {
        setMissing(true);
        setRect(null);
        return;
      }
      window.setTimeout(tryFind, 120);
    }

    tryFind();

    return () => {
      cancelled = true;
      detachListeners?.();
    };
  }, [target, active, pathname]);

  return { rect, missing };
}

function tooltipStyle(rect: DOMRect | null) {
  const width = Math.min(400, typeof window === "undefined" ? 400 : window.innerWidth - 24);
  if (!rect) {
    return {
      top: "50%",
      left: "50%",
      width,
      transform: "translate(-50%, -50%)",
    } as const;
  }
  const gap = 14;
  const cardH = 280;
  const below = rect.bottom + gap + cardH < window.innerHeight;
  const top = below ? rect.bottom + gap : Math.max(12, rect.top - gap - cardH);
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  return { top, left, width, transform: undefined };
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
  const router = useRouter();
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const navigatingRef = useRef(false);
  const bootstrapped = useRef(false);

  const step = tour.steps[stepIndex];
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
    navigatingRef.current = false;
    setPhase("welcome");
    notifyOnboardingActive();
  }, []);

  const startTour = useCallback(() => {
    setPhase("tour");
    setStepIndex(0);
    setCompletedIds([]);
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

  /** Reinicia desde cero: abre YA la UI y persiste en background. */
  const restartFromScratch = useCallback(() => {
    openWelcome();
    start(async () => {
      try {
        await resetOnboarding(surface);
      } catch {
        toast.error("No se pudo guardar el reinicio", {
          description: "El paseo se abrió igual; si recargás la página puede volver el estado anterior.",
        });
      }
    });
  }, [openWelcome, start, surface]);

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

  // Primera visita: mostrar bienvenida si está pendiente.
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

  // Reinicio desde Ayuda → Empezar guía.
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

  // Navegar a la ruta del paso actual.
  useEffect(() => {
    if (phase !== "tour" || !step) return;
    if (routeMatches(pathname, step.route)) {
      navigatingRef.current = false;
      return;
    }
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    router.push(step.route);
  }, [phase, step, pathname, router]);

  useEffect(() => {
    if (phase !== "welcome" && phase !== "tour") return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") skipAll();
      if (phase !== "tour") return;
      if (event.key === "ArrowRight" && stepIndex < tour.steps.length - 1) goToStep(stepIndex + 1);
      if (event.key === "ArrowLeft" && stepIndex > 0) goToStep(stepIndex - 1);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [phase, skipAll, goToStep, stepIndex, tour.steps.length]);

  if (phase === "idle") return null;

  if (phase === "welcome") {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-welcome-title"
      >
        {/* Fondo sin cerrar: el changelog ya no debe “robar” el click y saltar el paseo. */}
        <div className="absolute inset-0 bg-[hsl(213_47%_10%/0.78)] backdrop-blur-[2px]" />
        <div
          className="relative z-[101] w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 120% 80% at 0% 0%, hsl(213 47% 22% / 0.12), transparent 55%), radial-gradient(ellipse 90% 70% at 100% 100%, hsl(32 70% 48% / 0.08), transparent 50%)",
          }}
        >
          <div className="absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative p-6 sm:p-8">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Paseo de bienvenida
            </div>
            <h2 id="onboarding-welcome-title" className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
              {tour.welcomeTitle}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{tour.welcomeBody}</p>

            <ul className="mt-5 space-y-2.5 text-sm text-foreground/90">
              <li className="flex items-start gap-2.5">
                <Compass className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Recorremos los módulos de gestión, no las pantallas de sync ni importaciones.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>En cada paso ves qué se edita y qué otras pantallas afecta.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Podés reiniciar este paseo cuando quieras desde Ayuda → Empezar guía.</span>
              </li>
            </ul>

            <div className="mt-7 flex flex-wrap items-center gap-2">
              <Button type="button" size="lg" onClick={startTour} disabled={pending} className="gap-2">
                Empezar el paseo
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button type="button" size="lg" variant="ghost" onClick={skipAll} disabled={pending}>
                Ahora no
              </Button>
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">
              {tour.steps.length} pasos · ~{Math.max(3, Math.round(tour.steps.length * 0.4))} min
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!step) return null;

  const waitingRoute = !routeMatches(pathname, step.route);
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
    <div
      className="fixed inset-0 z-[100] print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={tour.title}
    >
      <div className="absolute inset-0 bg-[hsl(213_47%_8%/0.55)]" />
      {highlight && !waitingRoute ? (
        <div
          className="pointer-events-none absolute z-[101] rounded-lg transition-all duration-300"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            boxShadow: "0 0 0 9999px hsl(213 47% 8% / 0.55), 0 0 0 2px hsl(213 47% 92%)",
          }}
        />
      ) : null}

      <div
        className="absolute z-[102] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        style={tooltipStyle(waitingRoute ? null : rect)}
      >
        <div className="h-1 bg-secondary" aria-hidden>
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / tour.steps.length) * 100}%` }}
          />
        </div>
        <div className="p-4">
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
              aria-label="Cerrar paseo"
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {waitingRoute ? (
            <p className="text-sm text-muted-foreground">Abriendo {step.route}…</p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-foreground">{step.body}</p>
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
                    <span className="font-medium text-foreground">Afecta: </span>
                    {step.affects}
                  </span>
                </p>
              ) : null}
              {missing && step.target ? (
                <p className="mt-2 text-xs text-amber-700">
                  Este control no está visible ahora (puede faltar un permiso o estar colapsado).
                </p>
              ) : null}
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={skipAll}>
              Saltar paseo
            </button>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={stepIndex === 0 || waitingRoute}
                onClick={() => goToStep(stepIndex - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Atrás
              </Button>
              {stepIndex < tour.steps.length - 1 ? (
                <Button type="button" size="sm" disabled={waitingRoute} onClick={() => goToStep(stepIndex + 1)}>
                  Siguiente
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button type="button" size="sm" disabled={waitingRoute} onClick={finish}>
                  Listo
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
