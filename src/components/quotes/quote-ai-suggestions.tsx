"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveQuoteSuggestion, dismissQuoteSuggestion } from "@/server/actions/quote-suggestions";
import type { QuoteAiSuggestion } from "@/lib/quote-ai-suggestions";

export function QuoteAiSuggestions({
  quoteId,
  suggestions,
  issued,
}: {
  quoteId: string;
  suggestions: QuoteAiSuggestion[];
  issued?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div>
          <p className="text-sm font-medium">Sugeridos por la IA</p>
          <p className="text-xs text-muted-foreground">
            No están en la planilla. Aprobá los que van, o buscá el equipo a mano. El precio al aprobar es el del
            motor, el mismo que al agregar del catálogo.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {suggestions.map((item) => {
          const canApprove = Boolean(item.productId) || item.kind === "SERVICE";
          return (
            <li
              key={item.key}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/70 bg-card/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {item.quantity > 1 ? `${item.quantity} × ` : ""}
                  {item.name}
                  {item.kind === "SERVICE" ? (
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">Servicio</span>
                  ) : null}
                </p>
                {item.rationale ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{item.rationale}</p>
                ) : null}
                {!canApprove ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    No está en el catálogo. Si corresponde, buscalo abajo y agregalo vos.
                  </p>
                ) : null}
              </div>
              {!issued ? (
                <div className="flex shrink-0 items-center gap-1">
                  {canApprove ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const result = await approveQuoteSuggestion({ quoteId, key: item.key });
                          if (!result.ok) toast.error(result.error || "No se pudo aprobar.");
                          else {
                            toast.success("Agregado a la planilla");
                            router.refresh();
                          }
                        })
                      }
                    >
                      Aprobar
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await dismissQuoteSuggestion({ quoteId, key: item.key });
                        if (!result.ok) toast.error(result.error || "No se pudo descartar.");
                        else router.refresh();
                      })
                    }
                  >
                    Descartar
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
