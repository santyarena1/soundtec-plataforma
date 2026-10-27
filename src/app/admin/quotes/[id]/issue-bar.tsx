"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { issueQuote, submitQuoteForReview } from "@/server/actions/quote-export";

/**
 * Emitir = generar el PDF que recibe el cliente. Una emitida se puede seguir
 * editando; si cambió algo, el botón pasa a «Volver a generar el PDF» (mismo
 * número). Mientras falte algo obligatorio, el botón queda apagado y dice qué.
 * Quien no puede emitir la manda a revisión para que la emita un admin.
 */
export function QuoteIssueBar({
  quoteId,
  canIssue,
  status,
  pdfOutdated,
  missing,
}: {
  quoteId: string;
  canIssue: boolean;
  status: string;
  pdfOutdated: boolean;
  /** Lo que falta para poder emitir (checklist). */
  missing: string[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const issued = status === "ISSUED";
  if (issued && !pdfOutdated) {
    return <span className="text-sm text-muted-foreground">El PDF está al día con la cotización.</span>;
  }
  const run = (action: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>, done: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("quoteId", quoteId);
      const r = await action(fd);
      setMsg(r.error || done);
      if (!r.error) router.refresh();
    });
  const blocked = missing.length > 0;
  const label = issued ? "Volver a generar el PDF" : "Generar el PDF para el cliente";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canIssue ? (
        <Button type="button" size="sm" disabled={pending || blocked} onClick={() => run(issueQuote, issued ? "PDF regenerado." : "Listo: el PDF quedó generado.")}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Generando el PDF…" : label}
        </Button>
      ) : status === "IN_REVIEW" ? (
        <span className="text-sm text-muted-foreground">En revisión: el PDF lo genera un administrador.</span>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={pending || blocked} onClick={() => run(submitQuoteForReview, "Enviada a revisión: un administrador genera el PDF.")}>
          Enviar a revisión
        </Button>
      )}
      {blocked ? <span className="text-sm text-destructive">Falta: {missing.join(" ")}</span> : null}
      {msg ? <span className="text-sm text-muted-foreground">{msg}</span> : null}
    </div>
  );
}
