"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addProductToQuote } from "@/server/actions/quotes";
import type { PatternSuggestion, SimilarQuoteSummary } from "@/lib/quote-pattern-suggest";

export function QuotePatternSuggestions({
  quoteId,
  summary,
  similar,
  suggestions,
  issued,
}: {
  quoteId: string;
  summary: string;
  similar: SimilarQuoteSummary[];
  suggestions: PatternSuggestion[];
  issued?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const empty = !summary && suggestions.length === 0 && similar.length === 0;

  return (
    <div className="space-y-3 rounded-lg border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div>
          <p className="text-sm font-medium">Memoria interna</p>
          <p className="text-xs text-muted-foreground">
            {summary
              ? `Esta COT está marcada como ${summary}. Si coincide con otras, sugerimos lo que ya se usó.`
              : "Marcá tipo y escala para que compare con cotizaciones parecidas."}
          </p>
        </div>
      </div>
      {similar.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Parecidas:{" "}
          {similar
            .map((row) => `${row.number}${row.reference ? ` (${row.reference})` : ""}`)
            .join(" · ")}
        </p>
      ) : null}
      {suggestions.length > 0 ? (
        <ul className="space-y-1.5">
          {suggestions.map((item) => (
            <li key={`${item.productId}-${item.name}`} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-medium">{item.name}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">{item.reason}</span>
              </span>
              {item.productId && !issued ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const fd = new FormData();
                      fd.set("quoteId", quoteId);
                      fd.set("productId", item.productId);
                      fd.set("quantity", "1");
                      const result = await addProductToQuote(fd);
                      if (!result.ok) toast.error(result.error || "No se pudo agregar.");
                      else {
                        toast.success("Agregado a la planilla");
                        router.refresh();
                      }
                    })
                  }
                >
                  Agregar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : summary ? (
        <p className="text-xs text-muted-foreground">
          Todavía no hay otra COT con esta combinación. Cuando armes una, las siguientes van a sugerir a partir de
          esta.
        </p>
      ) : empty ? (
        <p className="text-xs text-muted-foreground">
          Guardá tipo y escala para comparar con cotizaciones parecidas. El cliente no ve esta clasificación.
        </p>
      ) : null}
    </div>
  );
}
