"use client";

/**
 * Pestaña "Cableado": cables por tipo con metros, avisos del sistema
 * (puertos, PoE, Dante, largos) y la lista de conexiones puerto a puerto.
 * Los equipos sin ficha leída se marcan y se pueden leer en el momento.
 */

import { useState } from "react";
import { AlertTriangle, Cable, CircleAlert, FileSearch, Info, Loader2, Eye, EyeOff, Workflow } from "lucide-react";
import { ConnectionDiagram } from "./connection-diagram";
import { SIGNAL_INFO, type Signal } from "@/services/room-builder/device-ports";
import type { CableFinding, CableLink } from "@/services/room-builder/cabling";
import type { CablingState } from "./use-cabling";

const LEVEL_STYLE: Record<CableFinding["level"], { box: string; icon: typeof Info }> = {
  error: { box: "border-rose-200 bg-rose-50 text-rose-900", icon: CircleAlert },
  warn: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle },
  info: { box: "border-slate-200 bg-slate-50 text-slate-700", icon: Info },
};

const SOURCE_LABEL: Record<string, string> = { datasheet: "Ficha del fabricante", specs: "Especificaciones oficiales", page: "Página oficial" };

function Dot({ signal }: { signal: Signal }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SIGNAL_INFO[signal].color }} />;
}

export function CablingPanel({ state, show3d, onShow3d, title = "Sala" }: { state: CablingState; show3d: boolean; onShow3d: (v: boolean) => void; title?: string }) {
  const { plan, profile } = state;
  const [diagram, setDiagram] = useState(false);
  if (!plan) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
        {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {state.error ?? "Calculando el cableado…"}
      </div>
    );
  }
  const label = new Map(plan.nodes.map((n) => [n.id, n.label]));
  const missing = plan.findings.find((f) => f.id === "missing-datasheet");
  const review = profile ? Object.values(profile.devices).filter((d) => d.datasheet === "review" && d.productId) : [];
  const withSheet = profile ? Object.values(profile.devices).filter((d) => d.datasheet === "ok").length : 0;
  const issues = plan.findings.filter((f) => f.id !== "missing-datasheet");
  const bySignal = new Map<Signal, CableLink[]>();
  for (const l of plan.links) bySignal.set(l.signal, [...(bySignal.get(l.signal) ?? []), l]);

  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <Cable className="h-4 w-4 text-[#1e3553]" /> Cableado
        </div>
        <button
          type="button"
          onClick={() => onShow3d(!show3d)}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${show3d ? "bg-[#1e3553] text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
        >
          {show3d ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} Cables en 3D
        </button>
      </div>

      {plan.links.length ? (
        <button
          type="button"
          onClick={() => setDiagram(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#1e3553]/30 bg-[#1e3553]/5 px-3 py-2 text-xs font-semibold text-[#1e3553] hover:bg-[#1e3553]/10"
        >
          <Workflow className="h-4 w-4" /> Diagrama de conexiones
        </button>
      ) : null}
      {diagram ? <ConnectionDiagram plan={plan} title={title} onClose={() => setDiagram(false)} /> : null}

      {missing || review.length ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-rose-900">
          <div className="font-semibold">{missing ? missing.title : "Fichas con datos sin confirmar"}</div>
          <p className="mt-0.5 text-xs leading-snug">
            {missing ? missing.detail : "Algunos datos de la ficha no pudieron verificarse con una cita textual."} Se busca la ficha oficial en el sitio del fabricante y se leen sus puertos con cita textual.
          </p>
          <button
            type="button"
            disabled={state.reading}
            onClick={() => void state.readDatasheets([...new Set([...(missing?.productIds ?? []), ...review.map((r) => r.productId!)])])}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-rose-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {state.reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />}
            {state.reading ? "Leyendo fichas oficiales…" : "Leer fichas ahora"}
          </button>
        </div>
      ) : null}
      {state.error ? <div className="rounded-md bg-rose-50 p-2 text-xs text-rose-800">{state.error}</div> : null}

      {plan.totals.length ? (
        <div className="grid grid-cols-2 gap-1.5">
          {plan.totals.map((t) => (
            <div key={t.signal} className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Dot signal={t.signal} /> {SIGNAL_INFO[t.signal].label}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {t.count} cable{t.count === 1 ? "" : "s"} · <span className="font-semibold text-slate-800">{t.meters} m</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {issues.length ? (
        <div className="space-y-1.5">
          {issues.map((f) => {
            const st = LEVEL_STYLE[f.level];
            const Icon = st.icon;
            return (
              <div key={f.id} className={`flex gap-2 rounded-lg border p-2 ${st.box}`}>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">{f.title}</div>
                  <div className="text-[11px] leading-snug">{f.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : plan.links.length ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">Señales, puertos y largos verificados contra las fichas.</div>
      ) : null}

      {[...bySignal.entries()].map(([signal, links]) => (
        <div key={signal}>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Dot signal={signal} /> {SIGNAL_INFO[signal].label}
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {links.map((l) => (
              <li key={l.id} className="px-2 py-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-xs text-slate-800">
                    <span className="font-medium">{label.get(l.from)}</span> <span className="text-slate-400">→</span> <span className="font-medium">{label.get(l.to)}</span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-700">{l.signal === "wireless" ? "sin cable" : `${l.cableM} m`}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {l.fromPort} → {l.toPort}
                  {l.note ? <span className="text-slate-600"> · {l.note}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {state.picks && (state.picks.lines.length || state.picks.missing.length) ? (
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-700">Cables del catálogo (van a la cotización)</div>
          <ul className="divide-y divide-slate-100">
            {state.picks.lines.map((l) => (
              <li key={l.product.id} className="flex items-start justify-between gap-2 px-2 py-1.5 text-[11px]">
                <span className="min-w-0 text-slate-700">
                  <span className="font-semibold">{l.quantity} ×</span> {[l.product.brand, l.product.name].filter(Boolean).join(" ")}
                  <span className="block text-slate-500">{l.note}</span>
                </span>
                <Dot signal={l.signal} />
              </li>
            ))}
            {state.picks.missing.map((m) => (
              <li key={m.signal} className="px-2 py-1.5 text-[11px] text-amber-800">
                <span className="font-semibold">{SIGNAL_INFO[m.signal].label}:</span> {m.count} cable(s), {m.meters} m — {m.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {profile ? (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-2 py-1.5 text-xs font-semibold text-slate-700">Equipos y fichas</summary>
          <ul className="divide-y divide-slate-100">
            {Object.entries(profile.devices).map(([id, d]) => (
              <li key={id} className="flex items-start justify-between gap-2 px-2 py-1.5 text-[11px]">
                <span className="min-w-0 text-slate-700">{d.label}</span>
                <span className="shrink-0 text-right">
                  <span className={d.datasheet === "ok" || d.datasheet === "none" ? (d.sourceKind === "secondary" ? "text-amber-700" : "text-emerald-700") : "text-rose-700"}>
                    {d.datasheet === "none" ? "Sin conexiones" : d.datasheet === "ok" ? (d.sourceKind === "secondary" ? "Fuente secundaria" : SOURCE_LABEL[d.sourceKind ?? ""] ?? "Ficha") : d.datasheet === "review" ? "A revisar" : "Falta ficha"}
                  </span>
                  {d.sources.slice(0, 2).map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="ml-1.5 text-sky-700 underline">
                      ver
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-[11px] leading-snug text-slate-400">
        Puertos de {withSheet} equipo(s) leídos de la ficha del fabricante. Recorrido por pared y cielorraso; los metros incluyen rulos de servicio en cada punta.
      </p>
    </div>
  );
}
