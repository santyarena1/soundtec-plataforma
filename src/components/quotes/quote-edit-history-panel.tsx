"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchQuoteEditHistory, restoreQuoteEditHistory, undoQuoteEdit } from "@/server/actions/quote-edit-history";
import { formatDate } from "@/lib/utils";

export function QuoteEditHistoryPanel({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<
    Array<{ id: string; summary: string; createdAt: Date; actor: { name: string | null } | null }>
  >([]);
  const [pending, start] = useTransition();

  function load() {
    start(async () => {
      const r = await fetchQuoteEditHistory(quoteId);
      if (r.ok) setItems(r.items);
    });
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quoteId]);

  function undo() {
    start(async () => {
      const r = await undoQuoteEdit(quoteId);
      if (r.ok) {
        router.refresh();
        load();
      }
    });
  }

  function restore(id: string) {
    start(async () => {
      const r = await restoreQuoteEditHistory(id);
      if (r.ok) {
        router.refresh();
        load();
      }
    });
  }

  return (
    <>
      <div className="fixed right-4 top-20 z-40 flex items-center gap-2 print:hidden">
        <Button type="button" size="sm" variant="outline" className="bg-card/95 shadow-sm" onClick={undo} disabled={pending}>
          <RotateCcw className="h-3.5 w-3.5" />
          Deshacer
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="bg-card/95 shadow-sm"
          aria-label="Historial de cambios"
          onClick={() => setOpen(true)}
        >
          <History className="h-4 w-4" />
        </Button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/30 print:hidden">
          <div className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="font-semibold">Historial de cambios</h3>
                <p className="text-xs text-muted-foreground">Restaurá un punto anterior de esta cotización.</p>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay cambios guardados en el historial.</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="rounded-md border border-border p-3">
                      <p className="text-sm font-medium">{item.summary}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(item.createdAt)}
                        {item.actor?.name ? ` · ${item.actor.name}` : ""}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={pending}
                        onClick={() => restore(item.id)}
                      >
                        Restaurar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
