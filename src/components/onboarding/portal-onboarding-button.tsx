"use client";

import { PlayCircle } from "lucide-react";
import { requestOnboardingStart } from "@/lib/onboarding/events";

/** Tutorial online del portal: bien a la vista para que el cliente lo encuentre al toque. */
export function PortalOnboardingButton() {
  return (
    <button
      type="button"
      onClick={() => requestOnboardingStart()}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 text-xs font-semibold text-accent-foreground shadow-sm ring-2 ring-accent/25 transition-colors hover:bg-accent/90 sm:px-3"
      title="Ver el tutorial del portal paso a paso"
    >
      <PlayCircle className="h-4 w-4" />
      <span className="lg:hidden">Tutorial</span>
      <span className="hidden lg:inline">Tutorial online</span>
    </button>
  );
}
