"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { generateRequestAiSuggestion } from "@/server/actions/ai-request";

export function AiSuggestResponseButton({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setText(null);
    start(async () => {
      const r = await generateRequestAiSuggestion(requestId);
      if (!r?.ok) setError(r?.error || "Error");
      else setText(r.suggestion);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={run} disabled={pending} variant="outline" size="sm">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Sugerir respuesta con IA
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {text ? (
        <div className="w-full rounded-md border border-accent/30 bg-accent/5 p-3 text-xs">
          <p className="font-semibold text-accent">Sugerencia (no enviada):</p>
          <p className="mt-1 whitespace-pre-wrap text-foreground">{text}</p>
          <p className="mt-2 text-muted-foreground">Copiala al campo "Respuesta visible al cliente" si te sirve.</p>
        </div>
      ) : null}
    </div>
  );
}
