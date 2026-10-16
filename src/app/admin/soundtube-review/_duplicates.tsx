"use client";

import { ImageOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { dismissSoundTubeDuplicate, mergeSoundTubeDuplicate } from "@/server/actions/soundtube-review";
import type { DuplicatePair, DuplicateSide } from "@/server/soundtube/identity";
import { useDecision, usd } from "./_use-decision";

const btn =
  "rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-secondary disabled:opacity-50";

function Side({ label, side }: { label: string; side: DuplicateSide }) {
  return (
    <div className="min-w-0 rounded-md bg-secondary/40 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold">{side.sku}</p>
      <p className="truncate text-xs text-muted-foreground" title={side.title}>{side.title}</p>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {side.brand} · {side.costUsd > 0 ? `costo ${usd(side.costUsd)}` : "sin precio"}
        {side.hasImage ? null : (
          <span className="inline-flex items-center gap-0.5">
            · <ImageOff className="h-3 w-3" /> sin foto
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * Productos que están dos veces en el catálogo: uno creado desde la lista y
 * otro traído del portal. Se unen eligiendo qué datos quedan visibles.
 */
export function DuplicatesSection({ items }: { items: DuplicatePair[] }) {
  const { pending, error, run } = useDecision();
  return (
    <Card id="duplicados">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Duplicados en el catálogo</h2>
          <span className={`text-xs font-medium ${items.length ? "text-amber-700" : "text-emerald-600"}`}>
            {items.length ? `${items.length} por decidir` : "Sin duplicados"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Productos creados desde la lista que parecen ser el mismo que uno del portal. Si son el mismo, queda un solo
          producto con el precio de la lista y con los datos que elijas a la vista; el otro se oculta (no se borra).
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {items.length === 0 ? <p className="text-sm text-muted-foreground">No hay productos repetidos entre la lista y el portal.</p> : null}
        {items.map((d) => (
          <div key={d.key} className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50/40 p-3 md:grid-cols-[1fr_1fr_auto] dark:bg-amber-950/10">
            <Side label="Creado desde la lista" side={d.excel} />
            <Side label="Del portal SoundTube" side={d.portal} />
            <div className="flex flex-col gap-1.5">
              <button type="button" disabled={pending} className={`${btn} border-primary/50`} onClick={() => run(() => mergeSoundTubeDuplicate(d.excel.id, d.portal.id, "excel"))}>
                Es el mismo · mostrar lo de la lista
              </button>
              <button type="button" disabled={pending} className={btn} onClick={() => run(() => mergeSoundTubeDuplicate(d.excel.id, d.portal.id, "portal"))}>
                Es el mismo · mostrar lo del portal
              </button>
              <button type="button" disabled={pending} className={`${btn} text-muted-foreground`} onClick={() => run(() => dismissSoundTubeDuplicate(d.excel.id, d.portal.id))}>
                Son productos distintos
              </button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
