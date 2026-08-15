"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { reviseQuoteNode } from "@/server/actions/quote-ai";

export function QuoteRevisePanel({
  quoteId,
  nodeId,
  kind,
}: {
  quoteId: string;
  nodeId: string;
  kind: "item" | "section";
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
        Rehacer con IA
      </Button>
      {open ? (
        <div className="mt-2 max-w-xl space-y-2 rounded-md border border-border p-3">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            placeholder="Instrucción sólo para esta pieza. Ej. más corto, otro modelo de la misma familia, sin mencionar SPL…"
          />
          <Button
            type="button"
            size="sm"
            disabled={pending || instruction.trim().length < 3}
            onClick={() => {
              start(async () => {
                const r = await reviseQuoteNode({ quoteId, nodeId, kind, instruction });
                setMessage(r.error || r.message || "Listo");
              });
            }}
          >
            {pending ? "Rehaciendo…" : "Aplicar instrucción"}
          </Button>
          {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
