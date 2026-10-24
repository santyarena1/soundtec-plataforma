"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startSoundTubeReview } from "@/server/actions/soundtube-review";
import { confirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Sube la lista (y, si hay, la planilla «Para revisar» con las respuestas) y
 * abre la revisión. Lo que ya se decidió en revisiones anteriores se conserva.
 */
export function StartReviewForm({ replace = false }: { replace?: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [corrections, setCorrections] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Lista de precios (Excel de SoundTube)</span>
          <input type="file" accept=".xlsx,.xls" className="block text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="block text-xs text-muted-foreground">Se leen todas las hojas. El precio sale solo de SPRDIS US.</span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Planilla «Para revisar» con tus respuestas (opcional)</span>
          <input type="file" accept=".xlsx,.xls" className="block text-sm" onChange={(e) => setCorrections(e.target.files?.[0] ?? null)} />
          <span className="block text-xs text-muted-foreground">Se aplican MUP corregidos, filas a ELIMINAR, marcas y SKUs corregidos.</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={replace ? "outline" : "primary"}
          size="sm"
          disabled={!file || pending}
          onClick={async () => {
            if (!file) return;
            if (
              replace &&
              !(await confirmDialog({ message: "Se reemplaza la lista. Las decisiones que ya tomaste se conservan. ¿Seguir?", confirmLabel: "Continuar" }))
            )
              return;
            setError(null);
            start(async () => {
              const form = new FormData();
              form.set("file", file);
              if (corrections) form.set("corrections", corrections);
              const r = await startSoundTubeReview(form);
              if (!r.ok) setError(r.error);
              else router.refresh();
            });
          }}
        >
          {pending ? "Leyendo…" : replace ? "Reemplazar lista" : "Empezar revisión"}
        </Button>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
