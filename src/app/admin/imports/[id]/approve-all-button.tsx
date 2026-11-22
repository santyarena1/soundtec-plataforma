"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveAllRows } from "@/server/actions/imports";
import { Loader2, CheckCircle2 } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { UncategorizedNewNotice } from "@/components/admin/uncategorized-new-notice";

export function ApproveAllButton({ batchId, disabled }: { batchId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [uncategorizedNew, setUncategorizedNew] = useState(0);
  const router = useRouter();

  async function handleClick() {
    if (!(await confirmDialog({ message: "¿Aprobar e importar todas las filas al catálogo?", confirmLabel: "Importar" }))) return;
    setMsg(null);
    setUncategorizedNew(0);
    const fd = new FormData();
    fd.set("batchId", batchId);
    start(async () => {
      const r = await approveAllRows(fd);
      if (r?.ok) {
        setMsg(`Procesados ${r.processed}, errores ${r.errors}.`);
        setUncategorizedNew(r.uncategorizedNew ?? 0);
        router.refresh();
      } else {
        setMsg(r?.error || "Error");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
        <Button onClick={handleClick} disabled={disabled || pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Aprobar todo e importar
        </Button>
      </div>
      <UncategorizedNewNotice count={uncategorizedNew} />
    </div>
  );
}
