"use client";

/**
 * Editor de la acústica de la sala: material por superficie, vidrio,
 * amoblamiento, personas, ruido de fondo, altura de oído y uso del sistema.
 * Lo que se cambia se guarda en la escena; lo que no, sale del preset del
 * tipo de sala (y se marca estimado).
 */

import { FURNISHING, MATERIALS, SURFACE_LABEL, USE_TARGETS, type Furnishing, type MaterialKey, type SoundUse, type Surface } from "@/services/room-builder/acoustics/materials";
import type { ResolvedAcoustics, SceneAcoustics } from "@/services/room-builder/acoustics/settings";

const SURFACES: Surface[] = ["floor", "ceiling", "walls", "glass"];
const NC_OPTIONS = [20, 25, 30, 35, 40, 45, 50];
const sel = "w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900 focus:border-[#1e3553] focus:outline-none focus:ring-1 focus:ring-[#1e3553]";

export function SoundMapSettings({ saved, resolved, onChange }: { saved: SceneAcoustics | null | undefined; resolved: ResolvedAcoustics; onChange: (patch: SceneAcoustics) => void }) {
  const mark = (fromUser: boolean) => (fromUser ? null : <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-800">típico</span>);
  return (
    <div className="space-y-2 text-xs">
      <label className="block">
        <span className="text-[11px] text-slate-600">Uso del sistema{mark(Boolean(saved?.use))}</span>
        <select className={sel} value={resolved.use} onChange={(e) => onChange({ use: e.target.value as SoundUse })}>
          {(Object.keys(USE_TARGETS) as SoundUse[]).map((u) => (
            <option key={u} value={u}>
              {USE_TARGETS[u].label}
            </option>
          ))}
        </select>
      </label>
      {SURFACES.map((s) => (
        <label key={s} className="block">
          <span className="text-[11px] text-slate-600">
            {SURFACE_LABEL[s]}
            {mark(Boolean(saved?.materials?.[s]))}
          </span>
          <select className={sel} value={resolved.materials[s]} onChange={(e) => onChange({ materials: { ...(saved?.materials ?? {}), [s]: e.target.value as MaterialKey } })}>
            {(Object.keys(MATERIALS) as MaterialKey[])
              .filter((k) => MATERIALS[k].surfaces.includes(s) || k === resolved.materials[s])
              .map((k) => (
                <option key={k} value={k}>
                  {MATERIALS[k].label}
                </option>
              ))}
          </select>
        </label>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] text-slate-600">Vidrio en paredes{mark(saved?.glassRatio != null)}</span>
          <input type="number" min={0} max={90} step={5} className={sel} value={Math.round(resolved.glassRatio * 100)} onChange={(e) => onChange({ glassRatio: Math.max(0, Math.min(90, Number(e.target.value) || 0)) / 100 })} aria-label="Porcentaje de vidrio en paredes" />
        </label>
        <label className="block">
          <span className="text-[11px] text-slate-600">Personas{mark(saved?.people != null)}</span>
          <input type="number" min={0} max={2000} step={1} className={sel} value={resolved.people} onChange={(e) => onChange({ people: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </label>
        <label className="block">
          <span className="text-[11px] text-slate-600">Ruido de fondo{mark(saved?.nc != null)}</span>
          <select className={sel} value={resolved.nc} onChange={(e) => onChange({ nc: Number(e.target.value) })}>
            {[...new Set([...NC_OPTIONS, resolved.nc])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>
                NC-{n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] text-slate-600">Altura de oído{mark(saved?.earM != null)}</span>
          <select className={sel} value={resolved.earM} onChange={(e) => onChange({ earM: Number(e.target.value) })}>
            {[...new Set([1.2, 1.7, resolved.earM])].map((m) => (
              <option key={m} value={m}>
                {m === 1.2 ? "1,2 m (sentado)" : m === 1.7 ? "1,7 m (de pie)" : `${String(m).replace(".", ",")} m`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-[11px] text-slate-600">Amoblamiento{mark(Boolean(saved?.furnishing))}</span>
        <select className={sel} value={resolved.furnishing} onChange={(e) => onChange({ furnishing: e.target.value as Furnishing })}>
          {(Object.keys(FURNISHING) as Furnishing[]).map((k) => (
            <option key={k} value={k}>
              {FURNISHING[k].label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
