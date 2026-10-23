"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { issueQuote, submitQuoteForReview } from "@/server/actions/quote-export";

/**
 * Quien puede emitir, emite. Quien no, la manda a revisión para que la emita
 * un admin (queda en «En revisión» en el listado).
 */
export function QuoteIssueBar({
  quoteId,
  canIssue,
  issued,
}: {
  quoteId: string;
  canIssue: boolean;
  issued: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (issued) return null;
  const run = (action: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>, done: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("quoteId", quoteId);
      const r = await action(fd);
      setMsg(r.error || done);
      if (!r.error) router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canIssue ? (
        <Button type="button" size="sm" disabled={pending} onClick={() => run(issueQuote, "Emitida")}>
          {pending ? "Emitiendo…" : "Emitir COT"}
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(submitQuoteForReview, "Enviada a revisión: un admin la emite.")}>
          Enviar a revisión
        </Button>
      )}
      {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
    </div>
  );
}
