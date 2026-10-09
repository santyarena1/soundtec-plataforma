"use client";

/**
 * Plano del ambiente: se sube una imagen, se tocan dos puntos de una medida
 * conocida (por ejemplo una pared) y con eso la sala 3D toma el tamaño real.
 */

import { useRef, useState, useTransition, type MouseEvent } from "react";
import { toast } from "sonner";
import { Loader2, Ruler, Upload } from "lucide-react";

type Props = {
  projectId: string;
  planImageUrl?: string | null;
  onUpdated: () => void;
};

type Point = { x: number; y: number };

/** Lado mayor con el que se manda la imagen: entra holgado en el límite de subida. */
const UPLOAD_MAX_SIDE = 2400;
const UPLOAD_QUALITY = 0.85;

/** Achica la imagen en el navegador antes de subirla (los planos suelen pesar mucho). */
export async function shrinkForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", UPLOAD_QUALITY));
  return blob ?? file;
}

async function readJson(res: Response): Promise<{ ok?: boolean; error?: string; bounds?: { widthM: number; depthM: number; areaM2: number } }> {
  const json = await res.json().catch(() => null);
  if (json) return json;
  if (res.status === 413) return { ok: false, error: "La imagen es demasiado pesada. Probá con una captura más chica." };
  return { ok: false, error: `El servidor respondió ${res.status}. Probá de nuevo.` };
}

export function PlanPanel({ projectId, planImageUrl, onUpdated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [pending, startTransition] = useTransition();
  const [points, setPoints] = useState<Point[]>([]);
  const [realMeters, setRealMeters] = useState(5);
  const [heightM, setHeightM] = useState(2.7);

  function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Subí el plano como imagen (PNG, JPG o WebP). Si es PDF, exportá la página como imagen.");
      return;
    }
    startTransition(async () => {
      try {
        const body = new FormData();
        const small = await shrinkForUpload(file);
        body.set("file", new File([small], "plano.webp", { type: small.type || file.type }));
        const res = await fetch(`/api/admin/room-builder/projects/${projectId}/plan`, { method: "POST", body });
        const json = await readJson(res);
        if (!json.ok) {
          toast.error(json.error || "No se pudo subir el plano");
          return;
        }
        setPoints([]);
        toast.success("Plano cargado. Ahora tocá dos puntos de una medida que conozcas.");
        onUpdated();
      } catch {
        toast.error("No pudimos procesar esa imagen. Probá con un PNG o JPG.");
      }
    });
  }

  /** Click en el plano → punto en píxeles reales de la imagen. */
  function pick(e: MouseEvent<HTMLDivElement>) {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const rect = img.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * img.naturalWidth;
    const y = ((e.clientY - rect.top) / rect.height) * img.naturalHeight;
    setPoints((prev) => (prev.length >= 2 ? [{ x, y }] : [...prev, { x, y }]));
  }

  function calibrate() {
    const img = imgRef.current;
    if (!img || points.length < 2) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/room-builder/projects/${projectId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "calibrate",
          imageWidthPx: img.naturalWidth,
          imageHeightPx: img.naturalHeight,
          p1: points[0],
          p2: points[1],
          realMeters,
          heightM,
        }),
      });
      const json = await readJson(res);
      if (!json.ok || !json.bounds) {
        toast.error(json.error || "No se pudo calibrar");
        return;
      }
      toast.success(`Sala ajustada al plano: ${json.bounds.widthM} × ${json.bounds.depthM} m (${json.bounds.areaM2} m²)`);
      onUpdated();
    });
  }

  const img = imgRef.current;
  const pct = (p: Point) =>
    img?.naturalWidth ? { left: `${(p.x / img.naturalWidth) * 100}%`, top: `${(p.y / img.naturalHeight) * 100}%` } : { left: "0", top: "0" };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Ruler className="h-4 w-4" /> Desde un plano
      </div>
      <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-slate-600">
        <li>Subí el plano (foto, captura o PNG/JPG).</li>
        <li>Tocá los dos extremos de algo que conozcas, por ejemplo una pared.</li>
        <li>Escribí cuántos metros mide y calibrá.</li>
      </ol>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => fileRef.current?.click()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {planImageUrl ? "Reemplazar plano" : "Subir plano"}
      </button>

      {planImageUrl ? (
        <>
          <div className="relative cursor-crosshair overflow-hidden rounded-lg border border-slate-200 bg-white" onClick={pick}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imgRef} src={planImageUrl} alt="Plano" className="block w-full select-none" draggable={false} onLoad={() => setPoints((p) => [...p])} />
            {points.length === 2 && img?.naturalWidth ? (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${img.naturalWidth} ${img.naturalHeight}`} preserveAspectRatio="none">
                <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke="#0f766e" strokeWidth={Math.max(2, img.naturalWidth / 300)} />
              </svg>
            ) : null}
            {points.map((p, i) => (
              <span
                key={i}
                style={pct(p)}
                className="pointer-events-none absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-teal-700 text-[10px] font-bold text-white shadow"
              >
                {i + 1}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            {points.length === 0 ? "Tocá el primer extremo." : points.length === 1 ? "Ahora tocá el segundo extremo." : "Listo. Si te equivocaste, tocá de nuevo."}
          </p>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
            <label className="block">
              Esa medida (m)
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={realMeters}
                onChange={(e) => setRealMeters(Number(e.target.value) || 1)}
                className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-1"
              />
            </label>
            <label className="block">
              Alto del techo (m)
              <input
                type="number"
                min={2}
                step={0.1}
                value={heightM}
                onChange={(e) => setHeightM(Number(e.target.value) || 2.7)}
                className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-1"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={pending || points.length < 2}
            onClick={calibrate}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-800 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Calibrar y ajustar la sala
          </button>
        </>
      ) : null}
    </div>
  );
}
