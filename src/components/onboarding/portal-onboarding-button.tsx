"use client";

import { PlayCircle } from "lucide-react";
import { requestOnboardingStart } from "@/lib/onboarding/events";

/** Tutorial online del portal, en el encabezado con el mismo tono que el resto de los botones chicos. */
export function PortalOnboardingButton() {
  return (
    <button
      type="button"
      onClick={() => requestOnboardingStart()}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      title="Ver el tutorial del portal paso a paso"
    >
      <PlayCircle className="h-3.5 w-3.5" />
      <span className="hidden sm:inline lg:hidden">Tutorial</span>
      <span className="hidden lg:inline">Tutorial online</span>
    </button>
  );
}
