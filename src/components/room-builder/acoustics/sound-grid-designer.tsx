"use client";

/**
 * Diseñador de grilla de techo: con el modelo de parlante elegido propone la
 * cantidad mínima para cada criterio (borde a borde, mínimo solape, borde a
 * centro) y el tap para llegar al SPL objetivo. Se previsualiza sobre el mapa
 * y se aplica a la escena (reubica y agrega/quita unidades de ese parlante).
 */

import { useMemo } from "react";
import { Grid3x3 } from "lucide-react";
import type { GridProposal } from "@/services/room-builder/acoustics/grid-design";
import { GRID_CRITERIA, type GridCriterion } from "@/services/room-builder/acoustics/grid-design";
import type { SceneDevice } from "@/services/room-builder/scene";

const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

export function SoundGridDesigner({
  speakers,
  deviceId,
  onDevice,
  proposals,
  selected,
  onSelect,
  onApply,
  otherCeiling,
}: {
  speakers: SceneDevice[];
  deviceId: string | null;
  onDevice: (id: string) => void;
  proposals: GridProposal[];
  selected: GridCriterion | null;
  onSelect: (c: GridCriterion | null) => void;
  onApply: (p: GridProposal) => void;
  /** Otros parlantes de techo que la grilla no toca. */
  otherCeiling: number;
}) {
  const current = useMemo(() => speakers.find((s) => s.id === deviceId) ?? null, [speakers, deviceId]);
  if (!speakers.length) {
    return <p className="text-xs text-slate-500">Sumá un parlante de techo (con producto) al ambiente para que el sistema proponga la grilla.</p>;
  }
  const pick = proposals.find((p) => p.criterion === selected) ?? null;
  return (
    <div className="space-y-2 text-xs">
      <label className="block">
        <span className="text-[11px] text-slate-600">Modelo de parlante</span>
        <select className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs" value={deviceId ?? ""} onChange={(e) => onDevice(e.target.value)}>
          {speakers.map((s) => (
            <option key={s.id} value={s.id}>
              {[s.brandName, s.productName ?? s.label].filter(Boolean).join(" ")} · ×{s.quantity}
            </option>
          ))}
        </select>
      </label>
      <table className="w-full text-[11px] tabular-nums">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left font-medium">Criterio</th>
            <th className="text-right font-medium">Cant.</th>
            <th className="text-right font-medium">Tap</th>
            <th className="text-right font-medium">SPL</th>
            <th className="text-right font-medium">Unif.</th>
            <th className="text-right font-medium">STI</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p) => {
            const on = p.criterion === selected;
            return (
              <tr
                key={p.criterion}
                tabIndex={0}
                aria-selected={on}
                onClick={() => onSelect(on ? null : p.criterion)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(on ? null : p.criterion)}
                className={`cursor-pointer border-t border-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-[#1e3553] ${on ? "bg-[#1e3553]/10 font-semibold" : "hover:bg-slate-50"}`}
                title={GRID_CRITERIA[p.criterion].hint}
              >
                <td className="py-1 text-left">{GRID_CRITERIA[p.criterion].label}</td>
                <td className="text-right">{p.count}</td>
                <td className="text-right">{p.tapW != null ? `${fmt(p.tapW, p.tapW < 1 ? 2 : 0)} W` : p.requiredW != null ? (p.requiredW < 0.1 ? "< 0,1 W" : `≈${fmt(p.requiredW)} W`) : "—"}</td>
                <td className={`text-right ${p.reaches ? "" : "text-red-600"}`}>{p.stats ? fmt(p.stats.splAvg) : "—"}</td>
                <td className="text-right">{p.stats ? `±${fmt(p.stats.uniformityDb)}` : "—"}</td>
                <td className="text-right">{p.stats ? fmt(p.stats.stiAvg, 2) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pick ? (
        <div className="space-y-1.5 rounded-md border border-[#1e3553]/30 bg-[#1e3553]/5 p-2">
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-700">
            {pick.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {current ? <li>Hoy: {current.quantity} unidad(es) de este modelo → propuesta: {pick.count}.</li> : null}
            {otherCeiling ? <li>Hay {otherCeiling} parlante(s) de techo de otro modelo: quedan como están.</li> : null}
          </ul>
          <button type="button" onClick={() => onApply(pick)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#1e3553] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#162a43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3553] focus-visible:ring-offset-1">
            <Grid3x3 className="h-3.5 w-3.5" />
            Aplicar grilla sugerida
          </button>
        </div>
      ) : (
        <p className="text-[10px] text-slate-500">Tocá un criterio para verlo en el mapa (punteado) y aplicarlo.</p>
      )}
    </div>
  );
}
