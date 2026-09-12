"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChangelogTimeline } from "@/components/admin/changelog-timeline";
import {
  CHANGELOG_SEEN_EVENT,
  markChangelogIdsSeen,
  unreadChangelogEntries,
} from "@/lib/changelog-seen";
import type { ChangelogEntryView } from "@/lib/changelog";
import {
  ONBOARDING_ACTIVE_EVENT,
  ONBOARDING_INACTIVE_EVENT,
  ONBOARDING_START_EVENT,
} from "@/lib/onboarding/events";
import type { OnboardingState } from "@/lib/onboarding/types";

export function ChangelogPopup({
  entries,
  onboardingState,
}: {
  entries: ChangelogEntryView[];
  /** Si el paseo de bienvenida está pendiente o en curso, no tapamos el onboarding. */
  onboardingState?: OnboardingState;
}) {
  const pathname = usePathname();
  const hideHere = pathname.startsWith("/admin/changelog");
  const [unread, setUnread] = useState<ChangelogEntryView[] | null>(null);
  const [open, setOpen] = useState(false);
  const [onboardingBlocks, setOnboardingBlocks] = useState(() => {
    const status = onboardingState?.admin?.status;
    return status === "pending" || status === "in_progress";
  });

  useEffect(() => {
    function sync() {
      setUnread(unreadChangelogEntries(entries));
    }
    sync();
    window.addEventListener(CHANGELOG_SEEN_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGELOG_SEEN_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [entries]);

  useEffect(() => {
    function block() {
      setOnboardingBlocks(true);
      setOpen(false);
    }
    function unblock() {
      setOnboardingBlocks(false);
    }
    window.addEventListener(ONBOARDING_START_EVENT, block);
    window.addEventListener(ONBOARDING_ACTIVE_EVENT, block);
    window.addEventListener(ONBOARDING_INACTIVE_EVENT, unblock);
    return () => {
      window.removeEventListener(ONBOARDING_START_EVENT, block);
      window.removeEventListener(ONBOARDING_ACTIVE_EVENT, block);
      window.removeEventListener(ONBOARDING_INACTIVE_EVENT, unblock);
    };
  }, []);

  useEffect(() => {
    const status = onboardingState?.admin?.status;
    if (status === "pending" || status === "in_progress") {
      setOnboardingBlocks(true);
      setOpen(false);
    }
  }, [onboardingState?.admin?.status]);

  useEffect(() => {
    setOpen(Boolean(unread && unread.length > 0 && !hideHere && !onboardingBlocks));
  }, [unread, hideHere, onboardingBlocks]);

  function dismiss() {
    markChangelogIdsSeen((unread || []).map((entry) => entry.id));
    setOpen(false);
  }

  if (!unread || unread.length === 0) return null;

  return (
    <Modal
      open={open}
      onClose={dismiss}
      size="lg"
      title="Novedades del sistema"
      description="Hay cambios nuevos en el panel admin. Esto no se muestra a los clientes. En esta computadora no vuelve a salir hasta que haya otra novedad."
      icon={<Sparkles className="h-4 w-4" />}
      footer={
        <Button onClick={dismiss}>
          Entendido
        </Button>
      }
    >
      <ChangelogTimeline entries={unread} />
    </Modal>
  );
}
