"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { deleteQuote, duplicateQuote, setQuoteStatus } from "@/server/actions/quotes";

const STATUSES = [
  { value: "DRAFT", label: "Borrador" },
  { value: "IN_REVIEW", label: "En revisión" },
  { value: "READY", label: "Lista" },
  { value: "ISSUED", label: "Emitida" },
  { value: "SUPERSEDED", label: "Reemplazada" },
  { value: "ARCHIVED", label: "Archivada" },
];

export function QuoteRowActions({
  quoteId,
  status,
  canEdit,
}: {
  quoteId: string;
  status: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!canEdit) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select
        className="h-8 w-[140px] text-xs"
        defaultValue={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            const fd = new FormData();
            fd.set("quoteId", quoteId);
            fd.set("status", next);
            const r = await setQuoteStatus(fd);
            if (r.error) {
              e.target.value = status;
              alert(r.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      <form action={duplicateQuote}>
        <input type="hidden" name="quoteId" value={quoteId} />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Duplicar
        </Button>
      </form>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!confirm("¿Eliminar esta cotización? No se puede deshacer.")) return;
          start(async () => {
            const fd = new FormData();
            fd.set("quoteId", quoteId);
            const r = await deleteQuote(fd);
            if (r.error) alert(r.error);
            router.refresh();
          });
        }}
      >
        Eliminar
      </Button>
    </div>
  );
}
