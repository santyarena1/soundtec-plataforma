"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteQuote, duplicateQuote, setQuoteStatus } from "@/server/actions/quotes";

// "Emitida" no está en la lista a propósito: emitir genera el PDF, el Excel y
// el snapshot de la versión, y eso solo ocurre desde la pantalla de la
// cotización. Cambiarlo acá dejaba una cotización emitida sin documento.
const STATUSES = [
  { value: "DRAFT", label: "Borrador" },
  { value: "IN_REVIEW", label: "En revisión" },
  { value: "READY", label: "Lista" },
  { value: "SUPERSEDED", label: "Reemplazada" },
  { value: "ARCHIVED", label: "Archivada" },
];

/** Estado de la cotización, editable desde el listado (columna Estado). */
export function QuoteStatusSelect({ quoteId, status }: { quoteId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Estado de la cotización"
      className="h-8 rounded-md border border-border bg-card px-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      defaultValue={status}
      disabled={pending || status === "ISSUED"}
      title={status === "ISSUED" ? "Emitida: para cambiarla, duplicala o abrila" : undefined}
      onChange={(e) => {
        const next = e.target.value;
        const select = e.currentTarget;
        start(async () => {
          const fd = new FormData();
          fd.set("quoteId", quoteId);
          fd.set("status", next);
          const r = await setQuoteStatus(fd);
          if (r.error) {
            select.value = status;
            toast.error(r.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      {status === "ISSUED" ? <option value="ISSUED">Emitida</option> : null}
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

/** Duplicar y eliminar (íconos). */
export function QuoteRowActions({ quoteId, canEdit }: { quoteId: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!canEdit) return null;

  return (
    <div className="flex items-center justify-end gap-0.5">
      <form action={duplicateQuote}>
        <input type="hidden" name="quoteId" value={quoteId} />
        <Button type="submit" size="sm" variant="ghost" className="h-8 w-8 px-0" disabled={pending} title="Duplicar" aria-label="Duplicar cotización">
          <Copy className="h-4 w-4" />
        </Button>
      </form>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 px-0 text-muted-foreground hover:text-destructive"
        title="Eliminar"
        aria-label="Eliminar cotización"
        disabled={pending}
        onClick={() => {
          if (!confirm("¿Eliminar esta cotización? No se puede deshacer.")) return;
          start(async () => {
            const fd = new FormData();
            fd.set("quoteId", quoteId);
            const r = await deleteQuote(fd);
            if (r.error) toast.error(r.error);
            router.refresh();
          });
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
