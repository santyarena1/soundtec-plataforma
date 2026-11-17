"use client";

import Link from "next/link";
import { ArrowRight, Compass, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";

export const TUTORIALS_PATH = "/portal/tutoriales";

interface TutorialChoiceProps {
  /** Al elegir «Ver videos» (antes de navegar): cerrar el cartel, marcar el tutorial, etc. */
  onVideos?: () => void;
  /** Al elegir «Hacer el recorrido guiado». */
  onGuidedTour: () => void;
  disabled?: boolean;
  className?: string;
}

const tileClass =
  "group flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60";

function TileBody({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {title}
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{text}</span>
      </span>
    </>
  );
}

/** Las dos formas de aprender el portal: videos cortos o el recorrido guiado en pantalla. */
export function TutorialChoice({ onVideos, onGuidedTour, disabled, className }: TutorialChoiceProps) {
  return (
    <div className={cn("grid gap-2.5 sm:grid-cols-2", className)}>
      <Link href={TUTORIALS_PATH} onClick={onVideos} className={cn(tileClass, disabled && "pointer-events-none opacity-60")} data-testid="tutorial-choice-videos">
        <TileBody
          icon={<MonitorPlay className="h-5 w-5" />}
          title="Ver videos"
          text="Videos cortos, de uno o dos minutos, con cada parte del portal: cuenta, catálogo, fichas, favoritos y Soundtec AI."
        />
      </Link>
      <button type="button" onClick={onGuidedTour} disabled={disabled} className={tileClass} data-testid="tutorial-choice-tour">
        <TileBody
          icon={<Compass className="h-5 w-5" />}
          title="Hacer el recorrido guiado"
          text="Te marcamos en pantalla dónde tocar, paso a paso, mientras navegás. Lo cerrás cuando quieras."
        />
      </button>
    </div>
  );
}
