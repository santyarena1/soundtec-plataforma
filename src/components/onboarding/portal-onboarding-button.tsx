"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GraduationCap, PlayCircle } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { TutorialChoice } from "@/components/tutorials/tutorial-choice";
import { requestOnboardingStart } from "@/lib/onboarding/events";

/** El recorrido guiado arranca en el inicio del portal (su primer paso está ahí). */
const TOUR_START_PATH = "/portal";

/**
 * Tutorial online del portal, en el encabezado con el mismo tono que el resto
 * de los botones chicos. Abre la elección: ver los videos o hacer el recorrido guiado.
 */
export function PortalOnboardingButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  function startGuidedTour() {
    setOpen(false);
    if (pathname !== TOUR_START_PATH) router.push(TOUR_START_PATH);
    requestOnboardingStart({ skipWelcome: true });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        title="Videos y recorrido guiado del portal"
        aria-haspopup="dialog"
        data-testid="portal-tutorial-button"
      >
        <PlayCircle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline lg:hidden">Tutorial</span>
        <span className="hidden lg:inline">Tutorial online</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tutorial online"
        description="Elegí cómo querés conocer el portal."
        icon={<GraduationCap className="h-4 w-4" />}
        size="lg"
      >
        <TutorialChoice onVideos={() => setOpen(false)} onGuidedTour={startGuidedTour} />
      </Modal>
    </>
  );
}
