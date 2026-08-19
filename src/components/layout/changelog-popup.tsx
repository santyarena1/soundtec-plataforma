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

export function ChangelogPopup({ entries }: { entries: ChangelogEntryView[] }) {
  const pathname = usePathname();
  const hideHere = pathname.startsWith("/admin/changelog");
  const [unread, setUnread] = useState<ChangelogEntryView[] | null>(null);
  const [open, setOpen] = useState(false);

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
    setOpen(Boolean(unread && unread.length > 0 && !hideHere));
  }, [unread, hideHere]);

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
