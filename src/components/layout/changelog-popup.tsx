"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChangelogTimeline } from "@/components/admin/changelog-timeline";
import { markChangelogsSeen } from "@/server/actions/changelog";
import type { ChangelogEntryView } from "@/lib/changelog";

export function ChangelogPopup({ entries }: { entries: ChangelogEntryView[] }) {
  const pathname = usePathname();
  const hideHere = pathname.startsWith("/admin/changelog");
  const [open, setOpen] = useState(entries.length > 0 && !hideHere);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (entries.length === 0 || hideHere) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [entries, hideHere]);

  function dismiss() {
    const ids = entries.map((entry) => entry.id);
    start(async () => {
      await markChangelogsSeen(ids);
      setOpen(false);
    });
  }

  if (entries.length === 0) return null;

  return (
    <Modal
      open={open}
      onClose={dismiss}
      size="lg"
      title="Novedades del sistema"
      description="Hay cambios nuevos en el panel admin. Esto no se muestra a los clientes."
      icon={<Sparkles className="h-4 w-4" />}
      footer={
        <Button onClick={dismiss} disabled={pending}>
          Entendido
        </Button>
      }
    >
      <ChangelogTimeline entries={entries} />
    </Modal>
  );
}
