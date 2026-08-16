"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { adminSetRequestStatus } from "@/server/actions/requests";
import { ADMIN_ASSIGNABLE_STATUSES, REQUEST_STATUS_META, type AdminAssignableStatus } from "@/lib/request-status";

/** Estados que conviene confirmar porque cierran la conversación. */
const NEEDS_CONFIRM: AdminAssignableStatus[] = ["REJECTED", "CLOSED", "CONFIRMED"];

export function StatusActions({ requestId, currentStatus }: { requestId: string; currentStatus: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<AdminAssignableStatus | null>(null);
  const router = useRouter();

  function apply(status: AdminAssignableStatus) {
    setConfirming(null);
    start(async () => {
      const r = await adminSetRequestStatus({ requestId, status });
      if (r.ok) {
        toast.success(`Marcada como “${REQUEST_STATUS_META[status].label}”`, {
          description: REQUEST_STATUS_META[status].adminHint,
        });
        router.refresh();
      } else {
        toast.error(r.error || "No se pudo cambiar el estado.");
      }
    });
  }

  function handleClick(status: AdminAssignableStatus) {
    if (NEEDS_CONFIRM.includes(status)) {
      setConfirming(status);
      return;
    }
    apply(status);
  }

  const options = ADMIN_ASSIGNABLE_STATUSES.filter((s) => s !== currentStatus);

  return (
    <>
      <div className="space-y-1.5">
        {options.map((s) => {
          const meta = REQUEST_STATUS_META[s];
          const Icon = meta.icon;
          return (
            <Button
              key={s}
              variant={s === "REJECTED" ? "ghost" : "outline"}
              size="sm"
              className={`w-full justify-start ${s === "REJECTED" ? "text-destructive hover:bg-destructive/10" : ""}`}
              disabled={pending}
              onClick={() => handleClick(s)}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
              {meta.actionLabel}
            </Button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Cambiar el estado no le manda ningún texto. Para eso usá «Responder al cliente».
      </p>

      <ConfirmDialog
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && apply(confirming)}
        pending={pending}
        tone={confirming === "REJECTED" ? "destructive" : "primary"}
        title={confirming ? `Marcar como “${REQUEST_STATUS_META[confirming].label}”` : ""}
        confirmLabel="Sí, cambiar estado"
        description={
          confirming ? (
            <>
              {REQUEST_STATUS_META[confirming].adminHint} El cliente va a ver el nuevo estado en su portal, sin ningún
              mensaje adicional.
            </>
          ) : null
        }
      />
    </>
  );
}
