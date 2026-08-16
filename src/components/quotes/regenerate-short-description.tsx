"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { regenerateQuoteProductShortDescription } from "@/server/actions/quote-ai";

export function RegenerateShortDescription({
  quoteId,
  productId,
}: {
  quoteId: string;
  productId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-[11px]"
        disabled={pending}
        title="Genera otra descripción corta y la guarda en el producto del catálogo"
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await regenerateQuoteProductShortDescription({ quoteId, productId });
            if (!result.ok) {
              setError(result.error || "No se pudo regenerar.");
              return;
            }
            toast.success("Descripción actualizada", {
              description: "Quedó guardada en el producto. La próxima COT usa esta versión.",
            });
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
        Regenerar descripción
      </Button>
      {error ? <p className="mt-0.5 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
