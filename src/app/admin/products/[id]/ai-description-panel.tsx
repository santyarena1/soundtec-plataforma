"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateProductDescription } from "@/server/actions/product-enrichment";

interface Props {
  productId: string;
  current: string | null;
  isAi: boolean;
}

export function AiDescriptionPanel({ productId, current, isAi }: Props) {
  const [text, setText] = useState<string | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await generateProductDescription(productId);
        if (!r.ok) {
          setError(r.error || "No se pudo generar la descripción.");
          return;
        }
        setText(r.description || "");
        setGenerated(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado al generar la descripción.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="heading-3">Descripción larga con IA</h2>
            <p className="text-xs text-muted-foreground">
              Usa OpenAI cuando hay API key, fallback a texto base si no hay credenciales.
            </p>
          </div>
          {isAi || generated ? <Badge tone="accent">Generada con IA</Badge> : null}
        </div>

        {text ? (
          <p className="whitespace-pre-line rounded-md border border-border bg-secondary/50 p-3 text-sm text-muted-foreground">
            {text}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay una descripción larga cargada.</p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            La descripción quedará guardada y se mostrará al cliente con un aviso de origen IA.
          </p>
          <Button type="button" size="sm" onClick={generate} disabled={pending}>
            {pending ? "Generando…" : isAi ? "Regenerar" : "Generar con IA"}
          </Button>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
