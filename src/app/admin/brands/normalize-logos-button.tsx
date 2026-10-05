"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeAllBrandLogos } from "@/server/actions/brand-logos";

/** Recorta márgenes y deja todos los logos cargados del mismo tamaño visual. */
export function NormalizeLogosButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await normalizeAllBrandLogos();
            setMessage(
              `Listo: ${r.updated} logo${r.updated === 1 ? "" : "s"} ajustado${r.updated === 1 ? "" : "s"}.` +
                (r.failed.length ? ` No se pudieron ajustar: ${r.failed.join(", ")} (subí el archivo).` : "")
            );
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Ajustar tamaño de todos los logos
      </Button>
      {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
    </div>
  );
}
