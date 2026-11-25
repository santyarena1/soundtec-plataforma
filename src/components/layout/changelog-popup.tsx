"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChangelogTimeline } from "@/components/admin/changelog-timeline";
import {
  CHANGELOG_SEEN_EVENT,
  markChangelogIdsSeen,
  unreadChangelogEntries,
} from "@/lib/changelog-seen";
import type { ChangelogEntryView, ChangelogIndexEntry } from "@/lib/changelog";
import { loadChangelogEntries } from "@/server/actions/changelog";
import {
  ONBOARDING_ACTIVE_EVENT,
  ONBOARDING_INACTIVE_EVENT,
  ONBOARDING_START_EVENT,
} from "@/lib/onboarding/events";
import type { OnboardingState } from "@/lib/onboarding/types";

/**
 * Aviso de novedades. Recibe solo el índice (id, versión, fecha): el texto de las
 * novedades sin ver se pide recién cuando el aviso tiene que abrirse, así cada
 * pantalla del admin no carga el changelog entero.
 */
export function ChangelogPopup({
  entries,
  onboardingState,
}: {
  entries: ChangelogIndexEntry[];
  /** Si el paseo de bienvenida está pendiente o en curso, no tapamos el onboarding. */
  onboardingState?: OnboardingState;
}) {
  const pathname = usePathname();
  const hideHere = pathname.startsWith("/admin/changelog");
  const [unread, setUnread] = useState<ChangelogIndexEntry[] | null>(null);
  const [details, setDetails] = useState<{ key: string; entries: ChangelogEntryView[] } | null>(null);
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

  const unreadKey = (unread ?? []).map((entry) => entry.id).join("|");
  const shouldShow = Boolean(unread && unread.length > 0 && !hideHere && !onboardingBlocks);

  useEffect(() => {
    if (!shouldShow) {
      setOpen(false);
      return;
    }
    if (details?.key === unreadKey) {
      setOpen(true);
      return;
    }
    let cancelled = false;
    loadChangelogEntries(unreadKey.split("|"))
      .then((loaded) => {
        if (cancelled || loaded.length === 0) return;
        setDetails({ key: unreadKey, entries: loaded });
        setOpen(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [shouldShow, unreadKey, details?.key]);

  function dismiss() {
    markChangelogIdsSeen((unread || []).map((entry) => entry.id));
    setOpen(false);
  }

  if (!unread || unread.length === 0 || !details) return null;
  const hidden = unread.length - details.entries.length;

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
      <ChangelogTimeline entries={details.entries} />
      {hidden > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Y {hidden} {hidden === 1 ? "novedad anterior" : "novedades anteriores"} sin ver:{" "}
          <Link href="/admin/changelog" onClick={dismiss} className="font-medium text-accent hover:underline">
            ver el changelog completo
          </Link>
          .
        </p>
      ) : null}
    </Modal>
  );
}
