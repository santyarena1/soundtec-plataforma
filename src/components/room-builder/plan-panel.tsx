"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Ruler, Upload } from "lucide-react";

type Props = {
  projectId: string;
  planImageUrl?: string | null;
  onUpdated: () => void;
};

export function PlanPanel({ projectId, planImageUrl, onUpdated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [p1, setP1] = useState({ x: 100, y: 100 });
  const [p2, setP2] = useState({ x: 400, y: 100 });
  const [realMeters, setRealMeters] = useState(5);
  const [heightM, setHeightM] = useState(2.7);
  const [imgSize, setImgSize] = useState({ w: 1000, h: 1000 });

  function upload(file: File) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      // dims aproximadas; el browser las refinará al calibrar
      fd.set("imageWidthPx", String(imgSize.w));
      fd.set("imageHeightPx", String(imgSize.h));
      const res = await fetch(
        `/api/admin/room-builder/projects/${projectId}/plan`,
        { method: "POST", body: fd },
      );
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "No se pudo subir el plano");
        return;
      }
      toast.success("Plano cargado. Calibrá la escala.");
      onUpdated();
    });
  }

  function calibrate() {
    startTransition(async () => {
      const res = await fetch(
        `/api/admin/room-builder/projects/${projectId}/plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "calibrate",
            imageWidthPx: imgSize.w,
            imageHeightPx: imgSize.h,
            p1,
            p2,
            realMeters,
            heightM,
          }),
        },
      );
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "No se pudo calibrar");
        return;
      }
      toast.success(
        `Calibrado: ${json.bounds.widthM} × ${json.bounds.depthM} m (${json.bounds.areaM2} m²)`,
      );
      onUpdated();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Ruler className="h-4 w-4" /> Desde plano
      </div>
      <p className="text-[11px] text-slate-500">
        Subí una imagen del plano, calibrá dos puntos con una medida real y
        extruímos muros 3D básicos.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
            URL.revokeObjectURL(url);
            upload(file);
          };
          img.src = url;
        }}
      />

      <button
        type="button"
        disabled={pending}
        onClick={() => fileRef.current?.click()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {planImageUrl ? "Reemplazar plano" : "Subir plano (PNG/JPG)"}
      </button>

      {planImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={planImageUrl}
          alt="Plano"
          className="max-h-36 w-full rounded-lg border border-slate-200 object-contain bg-white"
        />
      ) : null}

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <label className="block">
          P1 x
          <input
            type="number"
            value={p1.x}
            onChange={(e) => setP1((p) => ({ ...p, x: Number(e.target.value) }))}
            className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1"
          />
        </label>
        <label className="block">
          P1 y
          <input
            type="number"
            value={p1.y}
            onChange={(e) => setP1((p) => ({ ...p, y: Number(e.target.value) }))}
            className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1"
          />
        </label>
        <label className="block">
          P2 x
          <input
            type="number"
            value={p2.x}
            onChange={(e) => setP2((p) => ({ ...p, x: Number(e.target.value) }))}
            className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1"
          />
        </label>
        <label className="block">
          P2 y
          <input
            type="number"
            value={p2.y}
            onChange={(e) => setP2((p) => ({ ...p, y: Number(e.target.value) }))}
            className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1"
          />
        </label>
        <label className="col-span-1 block">
          Distancia real (m)
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={realMeters}
            onChange={(e) => setRealMeters(Number(e.target.value) || 1)}
            className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1"
          />
        </label>
        <label className="col-span-1 block">
          Alto libre (m)
          <input
            type="number"
            min={2}
            step={0.1}
            value={heightM}
            onChange={(e) => setHeightM(Number(e.target.value) || 2.7)}
            className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={pending || !planImageUrl}
        onClick={calibrate}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-800 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Calibrar y extruir 3D
      </button>
    </div>
  );
}
