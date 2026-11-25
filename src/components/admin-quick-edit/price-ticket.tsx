"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { searchQuickEditClients, type PriceSnapshot } from "@/server/actions/quick-edit-pricing";

const ars = (v: number) => v.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const markupText = (v: number) => `×${Number(v.toFixed(4)).toLocaleString("es-AR")}`;
const pct = (v: number) => `${Number(v.toFixed(2)).toLocaleString("es-AR")} %`;

const MARKUP_SOURCE: Record<PriceSnapshot["markupSource"], string> = {
  RULE: "regla",
  COEF_VTA: "COEF VTA de la ficha",
  DEFAULT: "markup por defecto",
};

function marginOrigin(s: PriceSnapshot) {
  if (s.marginRule) return `${s.marginRule.forClient ? "Condición del cliente" : "Regla"} de ${s.marginRule.scope} · ${s.marginRule.name}`;
  return MARKUP_SOURCE[s.markupSource];
}

function discountOrigin(s: PriceSnapshot) {
  if (s.discountPercent <= 0) return "Sin descuento";
  if (s.discountSource === "PRODUCT") return "Descuento propio del producto";
  if (s.discountRule) return `${s.discountRule.forClient ? "Condición del cliente" : "Regla"} de ${s.discountRule.scope} · ${s.discountRule.name}`;
  return "Regla de descuento";
}

function Row({ label, before, after, strong, note, changed }: { label: string; before: string; after: string; strong?: boolean; note?: string; changed: boolean }) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 py-1.5", strong ? "border-t border-dashed border-border pt-2.5" : "")}>
      <div className="min-w-0">
        <p className={cn("text-xs", strong ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</p>
        {note ? <p className="truncate text-[11px] text-muted-foreground/80" title={note}>{note}</p> : null}
      </div>
      <span className={cn("text-right font-mono text-xs tabular-nums", changed ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground", strong && !changed ? "text-sm font-semibold" : "")}>{before}</span>
      <span className={cn("min-w-[5.5rem] text-right font-mono tabular-nums", strong ? "text-sm font-semibold" : "text-xs", changed ? "text-accent" : "text-muted-foreground/40")}>{changed ? after : "="}</span>
    </div>
  );
}

/** «Ticket» del precio: cómo se arma hoy y cómo quedaría con el borrador. */
export function PriceTicket({ title, before, after, loading, roundingOn }: { title: string; before: PriceSnapshot; after: PriceSnapshot; loading: boolean; roundingOn: boolean }) {
  const diff = (a: number, b: number) => Math.abs(a - b) > 0.00005;
  const delta = before.finalUsd > 0 ? ((after.finalUsd - before.finalUsd) / before.finalUsd) * 100 : null;
  return (
    <div className="rounded-lg border border-border bg-gradient-to-b from-card to-secondary/30 px-3.5 py-3 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</p>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          <span>Hoy</span>
          <span className="min-w-[5.5rem] text-right">Simulado</span>
        </div>
      </div>
      <Row label="Costo nacionalizado" before={formatUsd(before.costoNacUsd)} after={formatUsd(after.costoNacUsd)} changed={diff(before.costoNacUsd, after.costoNacUsd)} />
      <Row label="Markup" note={marginOrigin(after)} before={markupText(before.markup)} after={markupText(after.markup)} changed={diff(before.markup, after.markup)} />
      <Row label="Precio de lista" before={formatUsd(before.listUsd)} after={formatUsd(after.listUsd)} changed={diff(before.listUsd, after.listUsd)} />
      <Row label="Descuento" note={discountOrigin(after)} before={pct(before.discountPercent)} after={pct(after.discountPercent)} changed={diff(before.discountPercent, after.discountPercent)} />
      <Row
        label="Precio final (USD, sin impuestos)"
        note={roundingOn && Math.abs(after.unroundedUsd - after.finalUsd) > 0.0005 ? `Redondeo por tramos: ${formatUsd(after.unroundedUsd)} → ${formatUsd(after.finalUsd)}` : undefined}
        before={formatUsd(before.finalUsd)}
        after={formatUsd(after.finalUsd)}
        changed={diff(before.finalUsd, after.finalUsd)}
        strong
      />
      <Row label={`En pesos con IVA ${after.ivaPercent} % (TC ${after.tc.toLocaleString("es-AR")})`} before={ars(before.finalArs)} after={ars(after.finalArs)} changed={diff(before.finalArs, after.finalArs)} />
      {delta != null && diff(before.finalUsd, after.finalUsd) ? (
        <p className={cn("mt-1 text-right text-[11px] font-medium", delta > 0 ? "text-success" : "text-destructive")}>
          {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toLocaleString("es-AR", { maximumFractionDigits: 1 })} % sobre el precio de hoy
        </p>
      ) : null}
    </div>
  );
}

/** Elegir un cliente de ejemplo para ver su precio (con sus condiciones). */
export function ClientPicker({ value, onChange }: { value: { id: string; name: string } | null; onChange: (c: { id: string; name: string } | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    let alive = true;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const rows = await searchQuickEditClients(q);
        if (alive) setResults(rows);
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) setBusy(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs">
        <span className="min-w-0 truncate">
          Cliente de ejemplo: <span className="font-medium">{value.name}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Sacar el cliente de ejemplo">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative" data-unsaved-guard="ignore">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ver el precio de un cliente (buscá por nombre o CUIT)" className="h-9 pl-8 text-xs" aria-label="Buscar cliente de ejemplo" />
      {busy ? <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
      {results.length ? (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg" role="listbox">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-secondary"
                onClick={() => {
                  onChange(c);
                  setQ("");
                  setResults([]);
                }}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
