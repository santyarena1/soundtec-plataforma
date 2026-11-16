"use client";

/**
 * Pestaña "Rack" de la vista técnica: el frente del rack a escala (equipos con
 * su alto en U, bandejas, paneles ventilados, reserva y PDU), el consumo y el
 * calor de cada equipo con los totales, y los avisos. Los equipos se reordenan
 * con las flechas o arrastrando en la lista; el orden se guarda en la escena
 * (rackOrder). En el ambiente lo guarda el editor; en el proyecto, esta vista.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { buildRack, dropInOrder, moveInOrder, ZONE_LABEL, type RackInput, type RackModel } from "@/services/room-builder/rack/rack-elevation";
import { POWER_KIND_LABEL } from "@/services/room-builder/rack/rack-power";
import { rackElevationSvg } from "@/services/room-builder/sheets/rack-elevation-svg";

const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });

export function RackView({
  projectId,
  refreshKey,
  order,
  onOrderChange,
}: {
  /** Ambiente (su rack) o proyecto (rack central y los de cada ambiente). */
  projectId: string;
  /** Cambia cuando cambian los equipos: se vuelven a leer los datos. */
  refreshKey?: string;
  /** Ambiente: el orden de la escena y cómo guardarlo (lo persiste el editor). */
  order?: string[] | null;
  onOrderChange?: (order: string[] | null) => void;
}) {
  const [racks, setRacks] = useState<RackInput[] | null>(null);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string[] | null>>({});
  const [dragKey, setDragKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/room-builder/projects/${projectId}/rack`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (!json?.ok) throw new Error(json?.error ?? "No se pudo armar el rack");
        setRacks(json.racks as RackInput[]);
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "No se pudo armar el rack"));
    return () => {
      alive = false;
    };
  }, [projectId, refreshKey]);

  const input = racks?.[Math.min(active, (racks?.length ?? 1) - 1)] ?? null;
  const controlled = Boolean(onOrderChange) && input?.id === projectId;
  const currentOrder = input ? (controlled ? (order ?? null) : input.id in overrides ? overrides[input.id]! : input.order) : null;
  const model = useMemo(() => (input ? buildRack({ ...input, order: currentOrder }) : null), [input, currentOrder]);
  const drawing = useMemo(() => (model && !model.empty ? rackElevationSvg(model, { maxHeightMm: 230, labelsMm: 95, selectedKey: selected }) : null), [model, selected]);

  const saveOrder = useCallback(
    async (next: string[] | null) => {
      if (!input) return;
      if (controlled) {
        onOrderChange!(next);
        return;
      }
      setOverrides((o) => ({ ...o, [input.id]: next }));
      const res = await fetch(`/api/admin/room-builder/projects/${projectId}/rack`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rackId: input.id, order: next }) })
        .then((r) => r.json())
        .catch(() => null);
      if (!res?.ok) toast.error("No se pudo guardar el orden del rack");
    },
    [controlled, input, onOrderChange, projectId],
  );

  if (!racks) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Armando el rack…
      </div>
    );
  }
  if (!input || !model) return <p className="p-6 text-sm text-slate-500">No hay equipos de rack.</p>;
  const movable = model.blocks.filter((b) => b.movable);

  return (
    <div className="space-y-3">
      {racks.length > 1 ? (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Rack">
          {racks.map((r, i) => (
            <button key={r.id} type="button" role="tab" aria-selected={i === active} onClick={() => { setActive(i); setSelected(null); }} className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${i === active ? "border-[#1e3553] bg-[#1e3553] text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {r.title} <span className="font-normal opacity-70">· {r.items.length} eq.</span>
            </button>
          ))}
        </div>
      ) : null}

      {model.empty ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{input.scope === "central" ? "El rack central no tiene equipos: cada ambiente lleva su propio rack." : "La sala no tiene equipos de rack."}</p>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-[1_1_560px] overflow-auto rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-600">
              <span>
                <b className="text-sm text-slate-900">Rack de {model.sizeU}U</b> · {model.usedU}U ocupadas · {model.freeU}U libres ({Math.round(model.reserve * 100)} %){model.depthCm ? ` · fondo útil ≥ ${model.depthCm} cm` : ""}
                {model.weightKg ? ` · ${model.weightEstimated ? "≥ " : ""}${fmt(model.weightKg)} kg` : ""}
              </span>
              <span className="text-slate-400">Escala 1:{drawing?.scale}</span>
            </div>
            {drawing ? (
              <div
                className="[&_svg]:h-auto [&_svg]:w-full"
                onClick={(e) => {
                  const key = (e.target as Element).closest("[data-key]")?.getAttribute("data-key");
                  setSelected(key ?? null);
                }}
                dangerouslySetInnerHTML={{ __html: drawing.svg }}
              />
            ) : null}
          </div>

          <div className="min-w-0 flex-[1_1_420px] space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <p className="font-semibold text-slate-700">Orden de arriba hacia abajo</p>
                <button type="button" onClick={() => void saveOrder(null)} disabled={!currentOrder} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40" title="Volver al orden lógico (red, control, fuentes, amplificadores)">
                  <RotateCcw className="h-3 w-3" /> Orden lógico
                </button>
              </div>
              <ul>
                {movable.map((b, i) => (
                  <li
                    key={b.key}
                    draggable
                    onDragStart={() => setDragKey(b.key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragKey) void saveOrder(dropInOrder(model.order, dragKey, b.key));
                      setDragKey(null);
                    }}
                    onClick={() => setSelected(b.key)}
                    className={`flex cursor-grab items-center gap-1.5 border-b border-slate-100 py-1 ${selected === b.key ? "bg-red-50" : ""}`}
                  >
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    <span className="w-14 shrink-0 font-mono text-slate-500">U{b.top}{b.u > 1 ? `–${b.bottom}` : ""}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {b.kind === "equipment" ? b.label : `${b.label}: ${b.items.map((x) => x.name).join(" + ")}`}
                      <span className="ml-1 text-slate-400">
                        {b.u}U{b.estimated ? " ≈" : ""} · {b.zone ? ZONE_LABEL[b.zone] : ""}
                      </span>
                    </span>
                    <button type="button" aria-label="Subir" disabled={i === 0} onClick={(e) => { e.stopPropagation(); void saveOrder(moveInOrder(model.order, b.key, -1)); }} className="rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label="Bajar" disabled={i === movable.length - 1} onClick={(e) => { e.stopPropagation(); void saveOrder(moveInOrder(model.order, b.key, 1)); }} className="rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-slate-400">Paneles ventilados, reserva y PDU se acomodan solos.</p>
            </div>
            <PowerTable model={model} />
          </div>
        </div>
      )}
    </div>
  );
}

function PowerTable({ model }: { model: RackModel }) {
  const p = model.power;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Consumo", `${fmt(p.totalW)} W`, p.estimatedW ? `≈ ${fmt(p.estimatedW)} W estimados` : "de las fichas"],
          ["Corriente", `${fmt(p.amps)} A`, "a 220 V"],
          ["Calor", `${fmt(p.heatBtu)} BTU/h`, `${fmt(p.heatW)} W en el rack`],
          ["Tomas", String(p.outlets), p.poeOutsideW || p.poeInRackW ? `PoE ${fmt(p.poeOutsideW + p.poeInRackW)} W` : "sin PoE"],
        ].map(([t, v, s]) => (
          <div key={t} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t}</p>
            <p className="text-base font-semibold text-slate-900">{v}</p>
            <p className="text-[11px] text-slate-500">{s}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <p className="mb-1 font-semibold text-slate-700">Recomendación</p>
        <p>
          <b>PDU</b>: {p.pdu.outlets} tomas, {p.pdu.amps} A{p.pdu.vertical ? " (vertical 0U atrás)" : " (1U al fondo del rack)"}
          {p.pdu.circuits > 1 ? ` · ${p.pdu.circuits} circuitos` : ""}.
        </p>
        <p className="mt-0.5">
          <b>Ventilación</b>: {p.ventilation.text}
        </p>
        {model.info.map((t) => (
          <p key={t} className="mt-0.5 text-slate-500">
            {t}
          </p>
        ))}
      </div>
      <div className="max-h-[38vh] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-1.5">Equipo</th>
              <th className="px-2 py-1.5">U</th>
              <th className="px-2 py-1.5 text-right">W</th>
              <th className="px-2 py-1.5 text-right">BTU/h</th>
              <th className="px-2 py-1.5">Dato</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.key} className="border-t border-slate-100" title={r.note ?? undefined}>
                <td className="px-2 py-1">{[r.brand, r.name].filter(Boolean).join(" ")}</td>
                <td className="px-2 py-1 text-slate-500">{r.u}</td>
                <td className={`px-2 py-1 text-right font-mono ${r.kind === "estimado" ? "italic text-amber-800" : ""}`}>{r.kind === "poe" ? "PoE" : `${r.kind === "estimado" ? "≈ " : ""}${fmt(r.watts)}`}</td>
                <td className="px-2 py-1 text-right font-mono">{fmt(r.heatBtu)}</td>
                <td className="px-2 py-1 text-slate-500">{r.kind === "poe" ? "Del switch" : POWER_KIND_LABEL[r.kind]}{r.note ? <span className="text-slate-400"> · {r.note}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {model.warnings.length ? (
        <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {model.warnings.map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
