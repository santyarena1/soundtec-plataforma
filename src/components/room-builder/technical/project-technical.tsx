"use client";

/**
 * Plano técnico del proyecto completo: el diagrama de señal de todos los
 * ambientes y el rack central como una sola instalación, la planilla de
 * cables de obra y los equipos y materiales totales. Exporta CSV.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { DiagramPositions } from "@/services/room-builder/wiring/diagram-layout";
import type { ProjectTechnical } from "@/services/room-builder/project-technical";
import { TechnicalDiagram } from "./technical-diagram";
import type { TechSelection } from "./technical-canvas";

type Tab = "diagrama" | "planilla" | "materiales";

function csv(rows: Array<Array<string | number | null>>): string {
  return rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
}
function download(name: string, content: string) {
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ProjectTechnicalView({ hubId, projectName }: { hubId: string; projectName: string }) {
  const [data, setData] = useState<ProjectTechnical | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [tab, setTab] = useState<Tab>("diagrama");
  const [positions, setPositions] = useState<DiagramPositions>({});
  const [selection, setSelection] = useState<TechSelection>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await fetch(`/api/admin/room-builder/projects/${hubId}/technical`).then((r) => r.json());
      if (!json?.ok) throw new Error(json?.error ?? "No se pudo armar el plano técnico");
      setData(json as ProjectTechnical);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo armar el plano técnico");
    } finally {
      setLoading(false);
    }
  }, [hubId]);

  const resolveAll = useCallback(async () => {
    setResolving(true);
    try {
      const json = await fetch(`/api/admin/room-builder/projects/${hubId}/technical`, { method: "POST" }).then((r) => r.json());
      if (!json?.ok) throw new Error(json?.error ?? "No se pudo resolver el proyecto");
      setData(json as ProjectTechnical);
      const added = (json.results as Array<{ added: number }>).reduce((a, r) => a + r.added, 0);
      toast.success(`Proyecto resuelto: ${json.model.wires.length} cables${added ? ` · ${added} equipo(s) sumados` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo resolver el proyecto");
    } finally {
      setResolving(false);
    }
  }, [hubId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ambientes sin cables trazados: se resuelven solos al abrir (una vez).
  const [autoRan, setAutoRan] = useState(false);
  useEffect(() => {
    if (!data || autoRan) return;
    if (data.rooms.some((r) => r.wires === 0 && r.devices > 0)) {
      setAutoRan(true);
      void resolveAll();
    }
  }, [data, autoRan, resolveAll]);

  const totals = useMemo(() => (data ? { cables: data.model.wires.length, meters: data.materials.reduce((a, m) => a + m.meters, 0), equipment: data.equipment.reduce((a, e) => a + e.quantity, 0) } : null), [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Armando el plano técnico del proyecto…
      </div>
    );
  }
  if (!data || !totals) return null;
  const slug = projectName.replace(/[^\w]+/g, "-").toLowerCase();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5" role="tablist">
          {([["diagrama", "Diagrama general"], ["planilla", "Planilla de cables"], ["materiales", "Equipos y materiales"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 text-xs font-semibold ${tab === k ? "bg-[#1e3553] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span>
            <b>{data.rooms.length}</b> ambientes · <b>{totals.equipment}</b> equipos · <b>{totals.cables}</b> cables · <b>{totals.meters.toFixed(0)} m</b>
          </span>
          <button type="button" onClick={resolveAll} disabled={resolving} className="inline-flex items-center gap-1.5 rounded-md bg-[#1e3553] px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">
            {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Resolver y trazar todo el proyecto
          </button>
        </div>
      </div>

      {tab === "diagrama" ? (
        <div className="h-[70vh] overflow-hidden rounded-xl border border-slate-200 bg-white">
          <TechnicalDiagram
            model={data.model}
            positions={positions}
            selection={selection}
            wiresWithIssues={new Set()}
            wireless={data.wireless ?? []}
            onSelect={setSelection}
            onConnect={() => toast.message("Para conectar cables entrá al plano técnico del ambiente.")}
            onMoveBlocks={setPositions}
            onResetLayout={() => setPositions({})}
          />
        </div>
      ) : null}

      {tab === "planilla" ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => download(`planilla-cables-${slug}.csv`, csv([["Ambiente", "Etiqueta", "Origen", "Puerto origen", "Destino", "Puerto destino", "Señal", "Largo (m)", "Cable"], ...data.schedule.map((r) => [r.room, r.label, r.from, r.fromPort, r.to, r.toPort, r.signal, r.lengthM, r.cable])]))}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> Descargar planilla (CSV)
          </button>
          <div className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  {["Ambiente", "Etiqueta", "Origen", "Puerto", "Destino", "Puerto", "Señal", "Largo", "Cable"].map((h, i) => (
                    <th key={i} className="px-2 py-1.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.schedule.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1">{r.room}</td>
                    <td className="px-2 py-1 font-mono">{r.label}</td>
                    <td className="px-2 py-1">{r.from}</td>
                    <td className="px-2 py-1 text-slate-500">{r.fromPort}</td>
                    <td className="px-2 py-1">{r.to}</td>
                    <td className="px-2 py-1 text-slate-500">{r.toPort}</td>
                    <td className="px-2 py-1">{r.signal}</td>
                    <td className="px-2 py-1 font-mono">{r.lengthM.toFixed(1)} m</td>
                    <td className="px-2 py-1 text-slate-500">{r.cable ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "materiales" ? (
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => download(`equipos-${slug}.csv`, csv([["Ambiente", "Equipo", "Marca", "Cantidad", "Tipo", "A completar"], ...data.equipment.map((e) => [e.room, e.name, e.brand, e.quantity, e.generic ? "Genérico" : "Catálogo", e.missing.join(", ")])]))}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Descargar equipos (CSV)
            </button>
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-1.5">Ambiente</th>
                    <th className="px-2 py-1.5">Equipo</th>
                    <th className="px-2 py-1.5 text-right">Cant.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.equipment.map((e, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1">{e.room}</td>
                      <td className="px-2 py-1">
                        {e.brand ? <span className="text-slate-500">{e.brand} · </span> : null}
                        {e.name}
                        {e.generic ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">genérico{e.missing.length ? ` · falta ${e.missing.join(" y ")}` : ""}</span> : null}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{e.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
              <p className="mb-1 font-semibold text-slate-700">Cable por tipo</p>
              {data.materials.map((m) => (
                <div key={m.signal} className="flex justify-between border-b border-slate-100 py-1">
                  <span>
                    {m.signal} × {m.cables}
                  </span>
                  <span className="font-mono">{m.meters.toFixed(1)} m</span>
                </div>
              ))}
            </div>
            {data.connectors.length ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <p className="mb-1 font-semibold text-slate-700">Conectores a armar en obra</p>
                {data.connectors.map((c) => (
                  <div key={c.name} className="flex justify-between border-b border-slate-100 py-1">
                    <span>{c.name}</span>
                    <span className="font-mono">{c.quantity}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
