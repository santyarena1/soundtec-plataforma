"use client";

/**
 * Vista 3D de solo lectura de una sala en el enlace del cliente. Liviana:
 * el visor (three.js) recién se descarga cuando el cliente toca "Ver en 3D",
 * y la escena viene de /p/[token]/escena ya limpia (sin plano del panel,
 * notas ni cableado). Es el mismo visor del editor, sin edición: girar,
 * acercar, cambiar de vista y abrir la maqueta en realidad aumentada.
 */

import dynamic from "next/dynamic";
import { useState } from "react";
import { Box, Loader2, X } from "lucide-react";
import type { RoomScene } from "@/services/room-builder/scene";
import type { CameraPreset, CoverageViewMode } from "@/services/room-builder/types";

const RoomViewport = dynamic(() => import("@/components/room-builder/room-viewport").then((m) => m.RoomViewport), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 bg-slate-200 text-sm text-slate-600">
      <Loader2 className="h-4 w-4 animate-spin" /> Cargando visor 3D…
    </div>
  ),
});

type Loaded = { name: string; category: string; templateKey: string; scene: RoomScene };

const noop = () => {};

export function PublicRoom3D({ token, roomId, roomName }: { token: string; roomId: string; roomName: string }) {
  const [state, setState] = useState<"idle" | "loading" | "open" | "error">("idle");
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    if (data) {
      setState("open");
      return;
    }
    setState("loading");
    try {
      const res = await fetch(`/p/${token}/escena?sala=${encodeURIComponent(roomId)}`);
      const json = (await res.json().catch(() => null)) as ({ ok: true } & Loaded) | { ok: false; error?: string } | null;
      if (!res.ok || !json || !json.ok) throw new Error((json && !json.ok && json.error) || "No se pudo abrir la sala 3D.");
      setData({ name: json.name, category: json.category, templateKey: json.templateKey, scene: json.scene });
      setState("open");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la sala 3D.");
      setState("error");
    }
  }

  if (state !== "open" || !data) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void open()} disabled={state === "loading"} className="inline-flex items-center gap-2 rounded-lg border border-[#1e3553] bg-white px-3 py-2 text-sm font-semibold text-[#1e3553] hover:bg-slate-50 disabled:opacity-60">
          {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Box className="h-4 w-4" />} Ver la sala en 3D
        </button>
        {state === "error" ? <span className="text-xs text-rose-700">{error}</span> : null}
      </div>
    );
  }

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-white">
      <figcaption className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vista 3D · {roomName}</span>
        <button type="button" onClick={() => setState("idle")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" aria-label="Cerrar vista 3D">
          <X className="h-3.5 w-3.5" /> Cerrar
        </button>
      </figcaption>
      <div className="h-[62vh] min-h-[320px] sm:h-[560px]">
        <Viewer data={data} />
      </div>
      <p className="px-3 py-2 text-xs text-muted-foreground">Vista ilustrativa del diseño: las medidas valen en el plano a escala.</p>
    </figure>
  );
}

/** Visor con su propio estado de cámara y de cobertura (no se guarda nada). */
function Viewer({ data }: { data: Loaded }) {
  const [scene, setScene] = useState<RoomScene>(data.scene);
  return (
    <RoomViewport
      scene={scene}
      category={data.category}
      templateKey={data.templateKey}
      projectName={data.name}
      onSelectSlot={noop}
      onCameraPreset={(preset: CameraPreset) => setScene((s) => ({ ...s, cameraPreset: preset }))}
      onCoverageView={(mode: CoverageViewMode) => setScene((s) => ({ ...s, coverageView: mode }))}
    />
  );
}
