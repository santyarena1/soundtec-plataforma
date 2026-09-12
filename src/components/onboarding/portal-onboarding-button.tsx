"use client";

import { Compass } from "lucide-react";
import { requestOnboardingStart } from "@/lib/onboarding/events";

/** Reinicia el paseo de bienvenida del portal. */
export function PortalOnboardingButton() {
  return (
    <button
      type="button"
      onClick={() => requestOnboardingStart()}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      title="Reiniciar paseo de bienvenida"
    >
      <Compass className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Guía</span>
    </button>
  );
}
