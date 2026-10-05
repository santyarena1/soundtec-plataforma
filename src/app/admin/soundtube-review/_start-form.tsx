"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startSoundTubeReview } from "@/server/actions/soundtube-review";

/** Sube el Excel y abre la revisión. Reemplaza cualquier revisión anterior. */
export function StartReviewForm({ replace = false }: { replace?: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="file"
        accept=".xlsx,.xls"
        aria-label="Excel de la lista SoundTube"
        className="text-sm"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Button
        variant={replace ? "outline" : "primary"}
        size="sm"
        disabled={!file || pending}
        onClick={() => {
          if (!file) return;
          if (replace && !window.confirm("Se reemplaza la lista y se pierden las decisiones tomadas. ¿Seguir?")) return;
          setError(null);
          start(async () => {
            const form = new FormData();
            form.set("file", file);
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
  );
}
