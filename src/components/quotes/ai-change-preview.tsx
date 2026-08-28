"use client";

import { Button } from "@/components/ui/button";
import { QuoteBody } from "@/components/quotes/quote-body";

interface Props {
  open: boolean;
  title: string;
  previousBody: string;
  nextBody: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function AiChangePreview({
  open,
  title,
  previousBody,
  nextBody,
  pending,
  onClose,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 print:hidden">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">Revisá el cambio de IA</h3>
          <p className="muted-text mt-0.5">{title} — compará antes de aplicar.</p>
        </div>
        <div className="grid flex-1 gap-4 overflow-auto p-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actual</p>
            <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm">
              <QuoteBody body={previousBody} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Propuesto por IA</p>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <QuoteBody body={nextBody} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Descartar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={pending}>
            {pending ? "Aplicando…" : "Aplicar cambio"}
          </Button>
        </div>
      </div>
    </div>
  );
}
