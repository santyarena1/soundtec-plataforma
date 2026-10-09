"use client";

/**
 * Carga de puertos reales del catálogo: lee la ficha de cada equipo (catálogo,
 * sitio del fabricante o fuente secundaria) en tandas hasta terminar, con el
 * avance a la vista. Se puede pausar y retomar: lo hecho no se repite.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Cable, Loader2, Pause, Play } from "lucide-react";

type Stats = { relevant: number; pending: number; auto: number; needsReview: number; approved: number; notApplicable: number };
type Batch = { scanned: number; built: number; skipped: number; failed: number; enriched: number; inputTokens: number; outputTokens: number; errors: string[] };

export function IoProfilesCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<Batch | null>(null);
  const [totals, setTotals] = useState({ built: 0, enriched: 0, failed: 0, tokens: 0 });
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/room-builder/io-profiles").catch(() => null);
    const json = await res?.json().catch(() => null);
    if (json?.ok) setStats(json.stats as Stats);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    stop.current = false;
    setRunning(true);
    setError(null);
    try {
      for (;;) {
        if (stop.current) break;
        const res = await fetch("/api/admin/room-builder/io-profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 16 }) });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error ?? `Error ${res.status}`);
        const b = json.result as Batch & { pending: number };
        setLast(b);
        setStats(json.stats as Stats);
        setTotals((t) => ({ built: t.built + b.built, enriched: t.enriched + b.enriched, failed: t.failed + b.failed, tokens: t.tokens + b.inputTokens + b.outputTokens }));
        if (!b.pending || (!b.built && !b.skipped)) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falló la carga");
    } finally {
      setRunning(false);
    }
  }

  const done = stats ? stats.relevant - stats.pending : 0;
  const pct = stats && stats.relevant ? Math.round((done / stats.relevant) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
            <Cable className="h-3.5 w-3.5" /> Puertos reales (fichas)
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {done}
            <span className="text-sm font-normal text-slate-500"> / {stats?.relevant ?? "—"} equipos</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => (running ? (stop.current = true) : void run())}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${running ? "border border-slate-300 bg-white text-slate-800" : "bg-slate-900 text-white hover:bg-slate-800"}`}
        >
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Pausar" : stats?.pending ? "Leer fichas" : "Revisar de nuevo"}
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {stats ? (
        <p className="mt-2 text-xs text-slate-500">
          {stats.auto + stats.approved} con todas las citas verificadas · {stats.needsReview} a revisar · {stats.notApplicable} sin conexiones · faltan {stats.pending}
        </p>
      ) : null}
      {running ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando y leyendo fichas (catálogo, sitio del fabricante, fuentes secundarias)…
        </p>
      ) : null}
      {totals.built ? (
        <p className="mt-1 text-xs text-slate-500">
          Esta corrida: {totals.built} leídos · {totals.enriched} fichas oficiales nuevas guardadas · {totals.failed} con error · {Math.round(totals.tokens / 1000)}k tokens
        </p>
      ) : null}
      {last?.errors.length ? <p className="mt-1 truncate text-xs text-amber-700">Último error: {last.errors[0]}</p> : null}
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
