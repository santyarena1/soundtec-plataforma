"use client";

/**
 * Mapa de sonido del ambiente (vista del editor): SPL, campo directo, STI y
 * uniformidad sobre la planta, con los resultados contra los objetivos del
 * uso, el editor de materiales y la grilla de techo sugerida. Se recalcula en
 * vivo al arrastrar un parlante o cambiar un material.
 */

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CablingState } from "../cabling/use-cabling";
import { applyGridToScene, ceilingSpeakers, gridSpeakerFor } from "@/services/room-builder/acoustics/grid-apply";
import { designGrids, type GridCriterion } from "@/services/room-builder/acoustics/grid-design";
import { HEAT_MODES, heatLegend, type HeatMode } from "@/services/room-builder/acoustics/heatmap";
import { polygonAreaPerimeter } from "@/services/room-builder/acoustics/reverb";
import { sceneSoundMap } from "@/services/room-builder/acoustics/scene-sources";
import { resolveAcoustics, type SceneAcoustics } from "@/services/room-builder/acoustics/settings";
import type { RoomScene } from "@/services/room-builder/scene";
import { layoutSceneDevices, sceneDims, type DeviceUnit } from "@/services/room-builder/units";
import { floorOf } from "@/services/room-builder/wiring/plan-geometry";
import { SoundMapCanvas, type CanvasSpeaker } from "./sound-map-canvas";
import { SoundMapResults } from "./sound-map-results";
import { SoundMapSettings } from "./sound-map-settings";
import { SoundGridDesigner } from "./sound-grid-designer";

type DragState = { deviceId: string; unit: number; x: number; z: number };

/** Unidades actuales de un equipo (las repartidas por el sistema incluidas). */
function deviceUnits(scene: RoomScene, deviceId: string): DeviceUnit[] {
  const laid = layoutSceneDevices(scene.devices, new Map(scene.slots.map((s) => [s.key, s])), sceneDims(scene));
  return laid.find((l) => l.device.id === deviceId)?.device.units ?? [];
}

function moveUnit(scene: RoomScene, d: DragState): RoomScene {
  const units = deviceUnits(scene, d.deviceId).map((u, k) => (k === d.unit ? { ...u, pose: { ...u.pose, x: d.x, z: d.z }, placed: true } : u));
  return { ...scene, devices: scene.devices.map((dev) => (dev.id === d.deviceId ? { ...dev, units, pose: units[0]?.pose ?? dev.pose } : dev)) };
}

export function SoundMapView({
  scene,
  category,
  cabling,
  onSceneChange,
  onUnitsChange,
}: {
  scene: RoomScene;
  category: string;
  cabling: CablingState;
  onSceneChange: (next: RoomScene) => void;
  onUnitsChange: (slotKey: string, units: DeviceUnit[]) => void;
}) {
  const [mode, setMode] = useState<HeatMode>("spl");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [gridDevice, setGridDevice] = useState<string | null>(null);
  const [criterion, setCriterion] = useState<GridCriterion | null>(null);
  const amplification = cabling.plan?.amplification ?? null;

  const live = useMemo(() => (drag ? moveUnit(scene, drag) : scene), [scene, drag]);
  const result = useMemo(() => sceneSoundMap(live, category, cabling.profile, amplification), [live, category, cabling.profile, amplification]);
  const floor = useMemo(() => floorOf(scene), [scene]);
  const resolved = useMemo(() => resolveAcoustics(category, scene.acoustics, polygonAreaPerimeter(floor).area), [category, scene.acoustics, floor]);

  const ceiling = useMemo(() => ceilingSpeakers(scene, cabling.profile), [scene, cabling.profile]);
  const deviceId = gridDevice && ceiling.some((d) => d.id === gridDevice) ? gridDevice : (ceiling[0]?.id ?? null);
  const device = ceiling.find((d) => d.id === deviceId) ?? null;
  const gridKey = JSON.stringify([floor, scene.heightM, resolved, deviceId]);
  const proposals = useMemo(() => {
    if (!device) return [];
    return designGrids({ floor, heightM: scene.heightM, speaker: gridSpeakerFor(device, cabling.profile, amplification), settings: resolved });
    // gridKey resume piso, alto, parámetros y modelo: no se recalcula al arrastrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridKey, cabling.profile]);
  const ghost = proposals.find((p) => p.criterion === criterion) ?? null;

  const speakers: CanvasSpeaker[] = result.sources.map((s) => {
    const half = (Math.min(s.coverage.horizontal, s.coverage.vertical) / 2) * (Math.PI / 180);
    const ceilingMount = s.axis.y < -0.99;
    return {
      key: s.id,
      deviceId: s.deviceId,
      unit: Number(s.id.split("#")[1] ?? 0),
      x: s.pos.x,
      z: s.pos.z,
      label: s.label,
      radiusM: ceilingMount ? Math.max(0, (s.pos.y - result.earM) * Math.tan(half)) : null,
    };
  });
  const legend = heatLegend(result, mode);

  const patchAcoustics = (patch: SceneAcoustics) => onSceneChange({ ...scene, acoustics: { ...(scene.acoustics ?? {}), ...patch } });

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex min-h-[360px] min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
          <div className="flex rounded-md border border-slate-300 bg-slate-50 p-0.5" role="tablist" aria-label="Capa del mapa">
            {(Object.keys(HEAT_MODES) as HeatMode[]).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded px-2.5 py-1 text-xs font-semibold ${mode === m ? "bg-[#1e3553] text-white" : "text-slate-700 hover:bg-white"}`}>
                {HEAT_MODES[m]}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-500">
            Plano de escucha a {String(result.earM).replace(".", ",")} m · grilla {String(result.grid.step).replace(".", ",")} m · arrastrá los parlantes
          </span>
          {cabling.loading && !cabling.profile ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> leyendo fichas…
            </span>
          ) : null}
        </div>
        <div className="min-h-0 flex-1">
          <SoundMapCanvas
            result={result}
            mode={mode}
            floor={floor}
            speakers={speakers}
            ghost={ghost ? { positions: ghost.positions, radiusM: ghost.radiusM } : null}
            onDrag={(s, x, z) => setDrag({ deviceId: s.deviceId, unit: s.unit, x, z })}
            onDrop={(s, x, z) => {
              const d = scene.devices.find((dev) => dev.id === s.deviceId);
              setDrag(null);
              if (!d) return;
              const next = moveUnit(scene, { deviceId: s.deviceId, unit: s.unit, x, z });
              onUnitsChange(d.slotKey, next.devices.find((dev) => dev.id === d.id)?.units ?? []);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-800">{legend.caption}</span>
          {legend.stops.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1">
              <span className="h-3 w-4 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded-full border-2 border-dashed border-slate-400" aria-hidden />
            cobertura a −6 dB en el plano de escucha
          </span>
        </div>
      </div>
      <aside className="w-full shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-3 lg:w-[350px]">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Mapa de sonido</h2>
        <SoundMapResults result={result} />
        <h3 className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Grilla de techo sugerida</h3>
        <SoundGridDesigner
          speakers={ceiling}
          deviceId={deviceId}
          onDevice={(id) => {
            setGridDevice(id);
            setCriterion(null);
          }}
          proposals={proposals}
          selected={criterion}
          onSelect={setCriterion}
          otherCeiling={ceiling.filter((d) => d.id !== deviceId).length}
          onApply={(p) => {
            if (!deviceId) return;
            onSceneChange(applyGridToScene(scene, deviceId, p));
            setCriterion(null);
            toast.success(`Grilla aplicada: ${p.count} parlante(s)${p.tapW != null ? `, tap ${String(p.tapW).replace(".", ",")} W` : ""}. La amplificación se recalcula sola.`);
          }}
        />
        <h3 className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sala y objetivo</h3>
        <SoundMapSettings saved={scene.acoustics} resolved={resolved} onChange={patchAcoustics} />
      </aside>
    </div>
  );
}
