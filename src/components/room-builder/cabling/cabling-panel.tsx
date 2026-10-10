"use client";

/**
 * Pestaña "Cableado" del editor: resumen de cables por tipo y metros, ver los
 * recorridos sobre el 3D y abrir el plano técnico (planta, diagrama de señal y
 * cada cable editable). Los problemas no se listan acá: el plano técnico los
 * resuelve solo.
 */

import { Cable, Eye, EyeOff, Loader2, Workflow } from "lucide-react";
import { SIGNAL_INFO, type Signal } from "@/services/room-builder/device-ports";
import type { CableLink } from "@/services/room-builder/cabling";
import type { CablingState } from "./use-cabling";

export function CablingPanel({ state, show3d, onShow3d, onOpenTechnical }: { state: CablingState; show3d: boolean; onShow3d: (v: boolean) => void; onOpenTechnical?: () => void }) {
  const { plan } = state;
  if (!plan) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
        {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {state.error ?? "Calculando el cableado…"}
      </div>
    );
  }
  const bySignal = new Map<Signal, CableLink[]>();
  for (const l of plan.links) bySignal.set(l.signal, [...(bySignal.get(l.signal) ?? []), l]);
  const cabled = [...bySignal].filter(([s]) => s !== "wireless");
  const wireless = bySignal.get("wireless") ?? [];

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
          {show3d ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {show3d ? "Ocultar en 3D" : "Ver en 3D"}
        </button>
      </div>
      {onOpenTechnical ? (
        <button type="button" onClick={onOpenTechnical} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1e3553] py-2 text-xs font-semibold text-white hover:bg-[#162a44]">
          <Workflow className="h-3.5 w-3.5" /> Abrir plano técnico (planta, diagrama y cables)
        </button>
      ) : null}
      <p className="text-[11px] leading-snug text-slate-500">El plano técnico resuelve solo lo que falte (amplificación, fuentes, gateways, red) y traza cada cable de puerto a puerto. Todo queda editable.</p>
      {cabled.length ? (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-700">Cables propuestos</p>
          {cabled.map(([s, links]) => (
            <div key={s} className="flex items-center justify-between border-b border-slate-100 py-1 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SIGNAL_INFO[s].color }} /> {SIGNAL_INFO[s].label} × {links.length}
              </span>
              <span className="font-mono">{links.reduce((a, l) => a + l.cableM, 0).toFixed(0)} m</span>
            </div>
          ))}
        </div>
      ) : null}
      {wireless.length ? <p className="text-xs text-slate-600">{wireless.length} enlace(s) inalámbrico(s).</p> : null}
    </div>
  );
}
