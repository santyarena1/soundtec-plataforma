"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("admin error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <h1 className="heading-3">No se pudo actualizar esta pantalla</h1>
      <p className="text-sm text-muted-foreground">
        El cambio puede haberse guardado igual. Recargá o reintentá. Si sigue, avisá al dev con el código{" "}
        {error.digest ? <span className="font-mono text-foreground">{error.digest}</span> : "de error"}.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Reintentar</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Recargar
        </Button>
      </div>
    </div>
  );
}
