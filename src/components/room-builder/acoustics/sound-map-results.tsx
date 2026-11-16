"use client";

/**
 * Resultados del mapa de sonido: semáforo de objetivos, SPL, uniformidad,
 * STI, RT60 por banda (Eyring y Sabine) y la lista de supuestos estimados.
 */

import { RT_BANDS, USE_TARGETS } from "@/services/room-builder/acoustics/materials";
import type { CheckStatus, SoundMapResult } from "@/services/room-builder/acoustics/sound-map";
import { stiRating } from "@/services/room-builder/acoustics/sti";

const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

const DOT: Record<CheckStatus, string> = { ok: "bg-emerald-500", warn: "bg-amber-400", fail: "bg-red-500", na: "bg-slate-300" };
const TXT: Record<CheckStatus, string> = { ok: "Cumple", warn: "Al límite", fail: "No cumple", na: "Sin datos" };

export function SoundMapResults({ result }: { result: SoundMapResult }) {
  const st = result.stats;
  const hzLabel = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : String(hz));
  return (
    <div className="space-y-3">
      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Objetivos · {USE_TARGETS[result.use].label}</h3>
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {result.checks.map((c) => (
            <li key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-xs">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[c.status]}`} aria-hidden />
              <span className="flex-1 text-slate-700">{c.label}</span>
              <span className="font-semibold tabular-nums text-slate-900">{c.value}</span>
              <span className="w-20 text-right text-[10px] text-slate-500" title={TXT[c.status]}>
                obj. {c.target}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">{USE_TARGETS[result.use].source}.</p>
      </section>

      {st ? (
        <section className="grid grid-cols-3 gap-1.5 text-center">
          {[
            ["SPL máx. prom.", `${fmt(st.splAvg)} dB`],
            ["Mín / máx", `${fmt(st.splMin, 0)} / ${fmt(st.splMax, 0)}`],
            ["Uniformidad", `±${fmt(st.uniformityDb)} dB`],
            ["Directo", `±${fmt(st.directUniformityDb)} dB`],
            ["STI prom.", `${fmt(st.stiAvg, 2)} (${stiRating(st.stiAvg)})`],
            ["STI mín.", fmt(st.stiMin, 2)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md border border-slate-200 bg-white px-1 py-1.5">
              <div className="text-[10px] text-slate-500">{k}</div>
              <div className="text-xs font-semibold tabular-nums text-slate-900">{v}</div>
            </div>
          ))}
        </section>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">Sin parlantes con producto en el ambiente: se muestra solo la acústica de la sala (RT60 y ruido).</p>
      )}

      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          RT60 por banda · {fmt(result.volumeM3, 0)} m³ · ruido NC-{result.nc} ≈ {fmt(result.noiseDbA, 0)} dBA
        </h3>
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left font-medium">Hz</th>
              {RT_BANDS.map((hz) => (
                <th key={hz} className="text-right font-medium">
                  {hzLabel(hz)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["eyring", "sabine"] as const).map((k) => (
              <tr key={k} className={k === "eyring" ? "font-semibold text-slate-900" : "text-slate-500"}>
                <td className="text-left">{k === "eyring" ? "Eyring" : "Sabine"}</td>
                {result.reverb
                  .filter((b) => (RT_BANDS as readonly number[]).includes(b.hz))
                  .map((b) => (
                    <td key={b.hz} className="text-right">
                      {fmt(b[k], 2)}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {st && st.operatingOffsetDb < -0.05 ? (
        <p className="text-[10px] leading-snug text-slate-500">
          El STI se calcula con la voz a {fmt(st.splAvg + st.operatingOffsetDb)} dB de operación (el sistema da {fmt(-st.operatingOffsetDb)} dB más a la potencia aplicada: margen para picos).
        </p>
      ) : null}

      <details className="rounded-md border border-amber-200 bg-amber-50/60 px-2 py-1.5 text-[11px] text-amber-950">
        <summary className="cursor-pointer font-semibold">Supuestos estimados ({result.estimates.length})</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {result.estimates.map((e) => (
            <li key={e}>dato estimado: {e}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
