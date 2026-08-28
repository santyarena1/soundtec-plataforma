"use client";

import { useEffect, useState } from "react";
import { AiRewriteBox } from "@/components/quotes/ai-rewrite-box";
import { QuoteSectionEditor } from "@/components/quotes/quote-section-editor";
import { Button } from "@/components/ui/button";
import { saveQuoteItemBody, saveQuoteSectionBody } from "@/server/actions/quotes";
import { previewReviseQuoteNode } from "@/server/actions/quote-ai";

export function QuoteRevisePanel({
  quoteId,
  nodeId,
  kind,
  alwaysOpen = false,
  warning,
  onRewritten,
}: {
  quoteId: string;
  nodeId: string;
  kind: "item" | "section";
  alwaysOpen?: boolean;
  warning?: string;
  onRewritten?: (body: string) => void;
}) {
  const [open, setOpen] = useState(alwaysOpen);
  const [message, setMessage] = useState<string | null>(null);

  const box = (
    <AiRewriteBox
      pending={false}
      message={message}
      warning={warning}
      previewTitle={kind === "section" ? "Módulo" : "Ítem"}
      onPreview={(instruction) => previewReviseQuoteNode({ quoteId, nodeId, kind, instruction })}
      onConfirmPreview={async (body) => {
        if (kind === "section") {
          const r = await saveQuoteSectionBody({ sectionId: nodeId, body });
          if (!r.ok) {
            setMessage(r.error || "No se pudo guardar.");
            return;
          }
          onRewritten?.(body);
          setMessage("Cambio aplicado.");
          return;
        }
        const r = await saveQuoteItemBody({ itemId: nodeId, description: body });
        if (!r.ok) {
          setMessage(r.error || "No se pudo guardar.");
          return;
        }
        onRewritten?.(body);
        setMessage("Cambio aplicado.");
      }}
    />
  );

  if (alwaysOpen) return box;

  return (
    <div>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
        Rehacer con IA
      </Button>
      {open ? <div className="mt-2 max-w-xl">{box}</div> : null}
    </div>
  );
}

export function QuoteSectionWorkbench({
  quoteId,
  sectionId,
  title,
  body,
  issued,
  warning,
}: {
  quoteId: string;
  sectionId: string;
  title: string;
  body: string;
  issued: boolean;
  warning?: string;
}) {
  const [current, setCurrent] = useState(body);
  useEffect(() => {
    setCurrent(body);
  }, [body]);

  return (
    <div className="space-y-2">
      <QuoteSectionEditor sectionId={sectionId} title={title} body={current} issued={issued} />
      {!issued ? (
        <QuoteRevisePanel
          quoteId={quoteId}
          nodeId={sectionId}
          kind="section"
          alwaysOpen
          warning={warning}
          onRewritten={setCurrent}
        />
      ) : null}
    </div>
  );
}
