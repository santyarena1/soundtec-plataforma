"use client";

/**
 * Tamaño de la pantalla según AVIXA V202 (DISCAS), en el panel de la pantalla:
 * distancia real al espectador más lejano (asientos de la sala), método según
 * el contenido (BDM / ADM / cine), diagonal mínima y comercial, borde inferior,
 * techo y ángulo lateral. Si pasa la pantalla plana más grande, recomienda
 * proyector o LED. El contenido elegido se guarda en la escena.
 */

import { useMemo, useState } from "react";
import { Ruler, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { DISPLAY_CONTENTS, DISPLAY_CONTENT_LABEL, defaultDisplayContent, sceneDisplaySizing, type DisplayContent } from "@/services/room-builder/discas";
import type { RoomScene, SceneDevice } from "@/services/room-builder/scene";

const m = (n: number) => `${n.toFixed(2).replace(".", ",")} m`;

export function DisplaySizingCard({ projectId, scene, category, device, onSaved }: { projectId: string; scene: RoomScene; category: string; device: SceneDevice | undefined; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const content = scene.displaySizing?.content ?? defaultDisplayContent(category);
  const r = useMemo(() => sceneDisplaySizing(scene, category, { deviceId: device?.id ?? null }), [scene, category, device?.id]);
  if (!r) return null;

  async function choose(next: DisplayContent) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/room-builder/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: { ...scene, displaySizing: { content: next } } }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error ?? "No se pudo guardar");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el contenido");
    } finally {
      setSaving(false);
    }
  }

  const big = r.recommendation.kind !== "flat";
  return (
    <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-2.5 text-[11px] leading-snug text-slate-700">
      <p className="flex items-center gap-1.5 font-semibold text-slate-900">
        <Ruler className="h-3.5 w-3.5 text-[#1e3553]" /> Tamaño de imagen (AVIXA V202 · DISCAS)
      </p>
      <label className="block">
        <span className="font-semibold text-slate-600">Qué se mira</span>
        <select className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px]" value={content} disabled={saving} onChange={(e) => void choose(e.target.value as DisplayContent)}>
          {DISPLAY_CONTENTS.map((c) => (
            <option key={c} value={c}>
              {DISPLAY_CONTENT_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        <dt className="text-slate-500">Espectador más lejano</dt>
        <dd className={r.distanceEstimated ? "text-amber-700" : ""}>
          {m(r.farthestM)} {r.distanceEstimated ? "(estimado: sin asientos ubicados)" : `· ${r.farthestLabel}`}
        </dd>
        <dt className="text-slate-500">Cálculo</dt>
        <dd className="font-mono text-[10.5px]">{r.formula}</dd>
        <dt className="text-slate-500">Diagonal mínima</dt>
        <dd>{Math.ceil(r.requiredIn)}" (16:9)</dd>
        <dt className="text-slate-500">Recomendado</dt>
        <dd className={`font-semibold ${big ? "text-amber-800" : "text-emerald-800"}`}>{r.recommendation.text}</dd>
        <dt className="text-slate-500">Borde inferior</dt>
        <dd>
          ≥ {m(r.bottomMinM)} · borde superior {m(r.topM)} (techo {m(scene.heightM)})
        </dd>
        {r.maxAngleDeg != null ? (
          <>
            <dt className="text-slate-500">Ángulo lateral</dt>
            <dd>
              {r.maxAngleDeg}° máx. ({r.lateralLabel}) · límite 45° (estimado)
            </dd>
          </>
        ) : null}
        {r.current ? (
          <>
            <dt className="text-slate-500">Pantalla elegida</dt>
            <dd className={r.current.enough ? "text-emerald-800" : "text-rose-700"}>
              {r.current.inches}" · {r.current.enough ? "alcanza" : "chica"} · imagen de {m(r.current.bottomM)} a {m(r.current.topM)}
            </dd>
          </>
        ) : null}
      </dl>
      {r.warnings.length ? (
        <ul className="space-y-1">
          {r.warnings.map((w, k) => (
            <li key={k} className="flex gap-1 rounded bg-amber-50 px-1.5 py-1 text-amber-900">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      ) : null}
      {big ? <p className="text-slate-500">Si no hay proyector o LED en el catálogo, sumalo como genérico (Agregar equipo → Genérico → Proyector genérico).</p> : null}
    </div>
  );
}
