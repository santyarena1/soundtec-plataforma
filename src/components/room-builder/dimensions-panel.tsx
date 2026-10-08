"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Maximize2 } from "lucide-react";

export function DimensionsPanel({
  projectId,
  widthM,
  depthM,
  heightM,
  onUpdated,
}: {
  projectId: string;
  widthM: number;
  depthM: number;
  heightM: number;
  onUpdated: () => void;
}) {
  const [w, setW] = useState(widthM);
  const [d, setD] = useState(depthM);
  const [h, setH] = useState(heightM);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setW(widthM);
    setD(depthM);
    setH(heightM);
  }, [widthM, depthM, heightM]);

  function save() {
    startTransition(async () => {
      const res = await fetch(
        `/api/admin/room-builder/projects/${projectId}/dimensions`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widthM: w, depthM: d, heightM: h }),
        },
      );
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "No se pudo actualizar");
        return;
      }
      toast.success(`Sala: ${w} × ${d} m (${(w * d).toFixed(1)} m²)`);
      onUpdated();
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Maximize2 className="h-4 w-4" /> Dimensiones (metros)
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <label className="block">
          Ancho
          <input
            type="number"
            min={1.5}
            max={80}
            step={0.1}
            value={w}
            onChange={(e) => setW(Number(e.target.value) || 1.5)}
            className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1"
          />
        </label>
        <label className="block">
          Fondo
          <input
            type="number"
            min={1.5}
            max={80}
            step={0.1}
            value={d}
            onChange={(e) => setD(Number(e.target.value) || 1.5)}
            className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1"
          />
        </label>
        <label className="block">
          Alto
          <input
            type="number"
            min={2.2}
            max={12}
            step={0.1}
            value={h}
            onChange={(e) => setH(Number(e.target.value) || 2.7)}
            className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1"
          />
        </label>
      </div>
      <p className="text-[11px] text-slate-500">
        Área: {(w * d).toFixed(1)} m² · reescala slots y cobertura
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Aplicar metros
      </button>
    </div>
  );
}
