"use client";

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { decideClassification, decideNewProduct, decidePair } from "@/server/actions/soundtube-review";
import type { ClassificationQuestion, NewProductQuestion, PairQuestion } from "@/server/soundtube/review";
import { useDecision, usd } from "./_use-decision";

const choice = (selected: boolean) =>
  `rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors disabled:opacity-50 ${
    selected ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border hover:bg-secondary"
  }`;

function RowInfo({ sku, description, costUsd, mup, excelRow }: { sku: string; description: string; costUsd: number; mup: number; excelRow: number }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-sm font-semibold">{sku}</p>
      <p className="truncate text-xs text-muted-foreground" title={description}>{description || "—"}</p>
      <p className="text-[11px] text-muted-foreground">
        Fila {excelRow} · costo {usd(costUsd)} · MUP ×{mup}
      </p>
    </div>
  );
}

/** ¿El SKU de la lista es uno de los productos parecidos del sistema? */
export function PairsSection({ items }: { items: PairQuestion[] }) {
  const { pending, error, run } = useDecision();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No hay SKUs con productos parecidos.</p>;
  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items.map((q) => (
        <div key={q.key} className={`grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] ${q.decision ? "border-border bg-secondary/30" : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10"}`}>
          <RowInfo {...q.row} />
          <div className="flex flex-wrap items-start gap-2">
            {q.candidates.map((c) => {
              const ratio = c.costUsd > 0 ? c.costUsd / q.row.costUsd : 0;
              const odd = c.costUsd === 0 || ratio > 2 || ratio < 0.5;
              return (
                <button key={c.id} type="button" disabled={pending} className={choice(q.decision === c.id)} onClick={() => run(() => decidePair(q.row.sku, c.id))}>
                  <span className="flex items-center gap-1 font-mono">
                    {q.decision === c.id ? <Check className="h-3 w-3" /> : null}Es {c.sku}
                  </span>
                  <span className={`block text-[11px] ${odd ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                    {c.brand} · hoy {usd(c.costUsd)}{c.isActive ? "" : " · inactivo"}
                  </span>
                </button>
              );
            })}
            <button type="button" disabled={pending} className={choice(q.decision === "NONE")} onClick={() => run(() => decidePair(q.row.sku, "NONE"))}>
              <span className="flex items-center gap-1">{q.decision === "NONE" ? <Check className="h-3 w-3" /> : null}Es otro producto</span>
              <span className="block text-[11px] text-muted-foreground">pasa a «Productos nuevos»</span>
            </button>
            {q.decision ? (
              <button type="button" disabled={pending} className="px-1 text-[11px] text-muted-foreground underline" onClick={() => run(() => decidePair(q.row.sku, null))}>
                Deshacer
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/** SKUs que no existen en el sistema: crearlos (con marca) o no cargarlos. */
export function NewProductsSection({ items, brands }: { items: NewProductQuestion[]; brands: string[] }) {
  const { pending, error, run } = useDecision();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No hay productos nuevos.</p>;
  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items.map((q) => {
        const creating = q.decision?.create === true;
        const done = q.decision && (!creating || !!q.decision.brand);
        return (
          <div key={q.key} className={`grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${done ? "border-border bg-secondary/30" : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10"}`}>
            <div className="min-w-0">
              <RowInfo {...q.row} />
              <p className="text-[11px] text-muted-foreground">
                {[q.row.categoria, q.row.segmento, q.row.familia, q.row.tipo].filter(Boolean).join(" · ")}
                {q.fromPair ? " · marcado como «otro producto»" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={pending} className={choice(creating)} onClick={() => run(() => decideNewProduct(q.row.sku, true, q.decision?.brand))}>
                {creating ? <Check className="mr-1 inline h-3 w-3" /> : null}Crear
              </button>
              {creating ? (
                <select
                  aria-label={`Marca de ${q.row.sku}`}
                  disabled={pending}
                  className={`h-8 rounded-md border bg-card px-2 text-xs ${q.decision?.brand ? "border-border" : "border-amber-400"}`}
                  value={q.decision?.brand ?? ""}
                  onChange={(e) => run(() => decideNewProduct(q.row.sku, true, e.target.value || undefined))}
                >
                  <option value="">Elegí la marca…</option>
                  {brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              ) : null}
              <button type="button" disabled={pending} className={choice(q.decision?.create === false)} onClick={() => run(() => decideNewProduct(q.row.sku, false))}>
                {q.decision?.create === false ? <Check className="mr-1 inline h-3 w-3" /> : null}No cargar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** SKUs repetidos con clasificación distinta: elegir cuál vale. */
export function ClassificationSection({ items }: { items: ClassificationQuestion[] }) {
  const { pending, error, run } = useDecision();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No hay clasificaciones repetidas.</p>;
  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items.map((q) => (
        <div key={q.key} className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${q.decision !== undefined ? "border-border bg-secondary/30" : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10"}`}>
          <p className="w-40 font-mono text-sm font-semibold">{q.conflict.sku}</p>
          {q.conflict.options.map((o) => (
            <button key={o.excelRow} type="button" disabled={pending} className={choice(q.decision === o.excelRow)} onClick={() => run(() => decideClassification(q.conflict.sku, o.excelRow))}>
              {q.decision === o.excelRow ? <Check className="mr-1 inline h-3 w-3" /> : null}
              {[o.categoria, o.segmento, o.familia, o.tipo].filter(Boolean).join(" · ")}
              <span className="ml-1 text-[11px] text-muted-foreground">(fila {o.excelRow})</span>
            </button>
          ))}
          {q.decision !== undefined ? <Badge tone="success">Resuelto</Badge> : null}
        </div>
      ))}
    </div>
  );
}
