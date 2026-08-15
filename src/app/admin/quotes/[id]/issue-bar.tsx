"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { issueQuote, submitQuoteForReview } from "@/server/actions/quote-export";

export function QuoteIssueBar({
  quoteId,
  canIssue,
  issued,
}: {
  quoteId: string;
  canIssue: boolean;
  issued: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (issued) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("quoteId", quoteId);
            const r = await submitQuoteForReview(fd);
            setMsg(r.error || "Enviada a revisión");
          })
        }
      >
        Enviar a revisión
      </Button>
      {canIssue ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("quoteId", quoteId);
              const r = await issueQuote(fd);
              setMsg(r.error || "Emitida");
            })
          }
        >
          Emitir COT
        </Button>
      ) : null}
      {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
    </div>
  );
}
