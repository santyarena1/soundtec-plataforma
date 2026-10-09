"use client";

/**
 * Visor 3D del Room Builder.
 *
 * Sala con materiales reales, iluminación de render, efectos de cámara y
 * equipos modelados (pantallas encendidas, LEDs). Cámara libre con límites,
 * viajes suaves entre vistas y giro automático tipo showroom.
 * La calidad baja sola si la compu no llega a mover la escena fluida.
 */

import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor, useProgress } from "@react-three/drei";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type MutableRefObject, type ReactNode } from "react";
import { Box as BoxIcon } from "lucide-react";
import { ArModal } from "./ar-modal";
import { SceneExportBridge, type ExportRoomFn } from "./three/scene-export";
import * as THREE from "three";
import type { CameraPreset, CoverageViewMode } from "@/services/room-builder/types";
import type { RoomScene } from "@/services/room-builder/scene";
import { roomTheme } from "./room-theme";
import { CameraRig } from "./three/camera-rig";
import { SceneEffects } from "./three/effects";
import { SceneLighting, moodFor } from "./three/lighting";
import { RoomShell } from "./three/room-shell";
import { SceneDeviceUnits } from "./three/scene-devices";
import type { DeviceUnit } from "@/services/room-builder/units";
import { resolveSceneFurniture, type FurnitureOverrides } from "@/services/room-builder/furnishing";
import { FurnitureLayer } from "./three/furniture-layer";
import { PlanUnderlay } from "./three/plan-underlay";
import { NavHelp } from "./three/nav-help";
import { CableLayer } from "./three/cable-layer";
import { SnapshotBridge, type SnapshotFn } from "./three/snapshot-bridge";
import type { CableLink } from "@/services/room-builder/cabling";
import { SurfaceProvider } from "./three/surfaces";

const PRESET_LABELS: Record<CameraPreset, string> = {
  general: "General",
  eye: "A nivel",
  cinema: "Cine",
  front_av: "Frente AV",
  plan: "Planta",
  detail: "Detalle",
  device_pov: "POV equipo",
};

type Quality = "high" | "fast";

class CanvasErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-900/20 backdrop-blur-[1px]">
      <div className="rounded-xl bg-white/95 px-5 py-3 text-center shadow-xl">
        <p className="text-sm font-semibold text-slate-900">Preparando la sala 3D…</p>
        <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${Math.round(progress)}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Aplica la calidad sin rearmar el Canvas: así bajar a "rápida" en pleno
 * arrastre no deja la escena en blanco ni resetea la cámara.
 */
function QualitySync({ quality }: { quality: Quality }) {
  const gl = useThree((s) => s.gl);
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    // Con efectos, el tono lo aplica el compositor; sin efectos, el renderer.
    gl.toneMapping = quality === "high" ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    setDpr(Math.min(window.devicePixelRatio || 1, quality === "high" ? 1.75 : 1.25));
  }, [gl, setDpr, quality]);
  return null;
}

function SceneContent({
  scene,
  category,
  templateKey,
  placementSlotKeys,
  onSelectSlot,
  onUnitsChange,
  onFurnitureChange,
  selectedFurnitureId,
  onSelectFurniture,
  quality,
  autoTour,
  showPlan,
  cables,
}: {
  /** Cables a dibujar (pestaña Cableado). */
  cables?: CableLink[] | null;
  scene: RoomScene;
  category: string;
  templateKey: string;
  placementSlotKeys: string[];
  onSelectSlot: (slotKey: string) => void;
  onUnitsChange?: (slotKey: string, units: DeviceUnit[]) => void;
  onFurnitureChange?: (next: FurnitureOverrides) => void;
  selectedFurnitureId: string | null;
  onSelectFurniture: (id: string | null) => void;
  quality: Quality;
  autoTour: boolean;
  /** Plano dibujado en el piso en vez de los muebles genéricos. */
  showPlan: boolean;
}) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const selected = scene.devices.find((d) => d.slotKey === scene.selectedSlotKey) ?? null;
  const placeSet = new Set(placementSlotKeys);
  const theme = roomTheme(category, templateKey);
  const widthM = Math.max(scene.widthM || 0, 1.5);
  const depthM = Math.max(scene.depthM || 0, 1.5);
  const heightM = Math.max(scene.heightM || 0, 2.2);
  const background = theme.outdoor ? "#b9c8b0" : "#c9d1db";
  // Forma real del piso (L, ochava) cuando el ambiente viene de un plano.
  const floor = scene.plan?.enabled && scene.plan.floorPolygon.length >= 3 ? scene.plan.floorPolygon : null;
  const dims = useMemo(() => ({ widthM, depthM, heightM, floor }), [widthM, depthM, heightM, floor]);
  const slotByKey = useMemo(() => new Map(scene.slots.map((sl) => [sl.key, sl])), [scene.slots]);
  const furniture = useMemo(() => resolveSceneFurniture(scene, category), [scene, category]);

  return (
    <SurfaceProvider enabled>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, Math.hypot(widthM, depthM) * 1.6, Math.hypot(widthM, depthM) * 4.5]} />
      <SceneLighting
        mood={moodFor(category, templateKey)}
        widthM={widthM}
        depthM={depthM}
        heightM={heightM}
        shadowMapSize={quality === "high" ? 2048 : 1024}
      />
      <RoomShell widthM={widthM} depthM={depthM} heightM={heightM} plan={scene.plan} category={category} templateKey={templateKey} />
      {scene.planUnderlay && showPlan ? (
        <Suspense fallback={null}>
          <PlanUnderlay underlay={scene.planUnderlay} floor={floor} widthM={widthM} depthM={depthM} />
        </Suspense>
      ) : null}
      <FurnitureLayer
        items={scene.planUnderlay && showPlan && !scene.planFurniture?.length ? [] : furniture}
        overrides={scene.furniture}
        dims={dims}
        selectedId={selectedFurnitureId}
        onSelect={onSelectFurniture}
        onChange={onFurnitureChange}
      />
      {scene.devices.map((device) => (
        <SceneDeviceUnits
          key={device.id}
          device={device}
          slot={slotByKey.get(device.slotKey)}
          dims={dims}
          selected={device.slotKey === scene.selectedSlotKey}
          selectedUnitId={selectedUnitId}
          placementTarget={placeSet.has(device.slotKey)}
          coverageView={scene.coverageView}
          onSelect={(key) => {
            onSelectFurniture(null);
            onSelectSlot(key);
          }}
          onSelectUnit={setSelectedUnitId}
          onUnitsChange={onUnitsChange}
        />
      ))}
      <CameraRig preset={scene.cameraPreset} widthM={widthM} depthM={depthM} heightM={heightM} selected={selected} autoTour={autoTour} />
      {cables?.length ? <CableLayer links={cables} /> : null}
      {quality === "high" ? <SceneEffects /> : null}
    </SurfaceProvider>
  );
}

export function RoomViewport({
  scene,
  category = "videoconference",
  templateKey,
  placementSlotKeys = [],
  placementHint,
  onSelectSlot,
  onCameraPreset,
  onCoverageView,
  onUnitsChange,
  onFurnitureChange,
  projectName = "Sala",
  cables = null,
  snapshotRef,
}: {
  /** Cables del ambiente (se muestran al activarlos en la pestaña Cableado). */
  cables?: CableLink[] | null;
  /** Captura de la vista actual (propuesta en PDF). */
  snapshotRef?: MutableRefObject<SnapshotFn | null>;
  scene: RoomScene;
  category?: string;
  templateKey?: string;
  placementSlotKeys?: string[];
  placementHint?: string | null;
  onSelectSlot: (slotKey: string) => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onCoverageView: (mode: CoverageViewMode) => void;
  /** Unidades movidas, giradas, duplicadas o quitadas en el 3D. */
  onUnitsChange?: (slotKey: string, units: DeviceUnit[]) => void;
  /** Muebles quitados o movidos en el 3D. */
  onFurnitureChange?: (next: FurnitureOverrides) => void;
  /** Nombre para la maqueta descargable. */
  projectName?: string;
}) {
  const exportRef = useRef<ExportRoomFn | null>(null);
  const [arOpen, setArOpen] = useState(false);
  const buildModel = useCallback(
    () => (exportRef.current ? exportRef.current() : Promise.reject(new Error("La sala 3D todavía está cargando"))),
    [],
  );
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>("high");
  const [autoTour, setAutoTour] = useState(true);
  const [showPlan, setShowPlan] = useState(true);
  const [canvasKey, setCanvasKey] = useState(0);
  const [showHelp, setShowHelp] = useState(true);
  const presets = Object.keys(PRESET_LABELS) as CameraPreset[];
  const resolvedKey = templateKey || scene.templateKey || category;
  const sceneOk =
    Number.isFinite(scene.widthM) &&
    scene.widthM >= 1.5 &&
    Number.isFinite(scene.depthM) &&
    scene.depthM >= 1.5 &&
    Number.isFinite(scene.heightM) &&
    scene.heightM >= 2.2 &&
    scene.slots.length > 0;

  useEffect(() => {
    const t = setTimeout(() => setShowHelp(false), 7000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-slate-300">
      {!sceneOk ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-600">
          La escena 3D de este proyecto está dañada o incompleta. Usá <span className="mx-1 font-semibold">Reparar 3D</span> en
          la barra superior, o creá un proyecto nuevo con la misma tipología.
        </div>
      ) : (
        <CanvasErrorBoundary
          onError={() => {
            setQuality("fast");
            setCanvasKey((k) => k + 1);
          }}
        >
          <Canvas
            key={`rb-canvas-${canvasKey}`}
            shadows="soft"
            className="h-full w-full touch-none"
            camera={{ position: [6, 5, -7], fov: 40, near: 0.05, far: 200 }}
            gl={{ antialias: true, powerPreference: "high-performance", toneMappingExposure: 1 }}
            dpr={[1, 1.75]}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.domElement.addEventListener(
                "webglcontextlost",
                (e) => {
                  e.preventDefault();
                  setQuality("fast");
                  setCanvasKey((k) => k + 1);
                },
                { once: true },
              );
            }}
            onPointerMissed={() => setSelectedFurnitureId(null)}
          >
            <QualitySync quality={quality} />
            <SceneExportBridge exportRef={exportRef} />
            {snapshotRef ? <SnapshotBridge snapshotRef={snapshotRef} /> : null}
            {quality === "high" ? <PerformanceMonitor onDecline={() => setQuality("fast")} flipflops={2} /> : null}
            <SceneContent
              scene={scene}
              category={category}
              templateKey={resolvedKey}
              placementSlotKeys={placementSlotKeys}
              onSelectSlot={onSelectSlot}
              onUnitsChange={onUnitsChange}
              onFurnitureChange={onFurnitureChange}
              selectedFurnitureId={selectedFurnitureId}
              onSelectFurniture={setSelectedFurnitureId}
              quality={quality}
              autoTour={autoTour}
              showPlan={showPlan}
              cables={cables}
            />
          </Canvas>
          <LoadingOverlay />
        </CanvasErrorBoundary>
      )}

      <NavHelp />

      {placementHint ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center px-3">
          <div className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white shadow-lg">{placementHint}</div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3">
        <div className="pointer-events-auto flex max-w-[70%] flex-wrap gap-1 rounded-xl bg-white/85 p-1 shadow-lg backdrop-blur">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onCameraPreset(preset)}
              className={`rounded-lg px-2 py-1 text-[11px] font-medium transition sm:px-2.5 sm:py-1.5 sm:text-xs ${
                scene.cameraPreset === preset ? "bg-slate-900 text-white shadow" : "text-slate-700 hover:bg-white"
              }`}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto flex flex-wrap justify-end gap-1 rounded-xl bg-white/85 p-1 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setArOpen(true)}
            disabled={!sceneOk}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white disabled:opacity-40 sm:px-2.5 sm:py-1.5 sm:text-xs"
            title="Maqueta 3D para girar, descargar o ver en realidad aumentada"
          >
            <BoxIcon className="h-3.5 w-3.5" /> AR
          </button>
          {scene.planUnderlay ? (
            <button
              type="button"
              onClick={() => setShowPlan((v) => !v)}
              className={`rounded-lg px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:py-1.5 sm:text-xs ${showPlan ? "bg-teal-700 text-white" : "text-slate-700 hover:bg-white"}`}
              title="Piso con el plano original (muebles y puertas dibujados) o con muebles 3D genéricos"
            >
              {showPlan ? "Piso: plano" : "Piso: muebles 3D"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setAutoTour((v) => !v)}
            className={`rounded-lg px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:py-1.5 sm:text-xs ${autoTour ? "bg-indigo-700 text-white" : "text-slate-700 hover:bg-white"}`}
            title="Giro automático cuando no tocás la cámara"
          >
            {autoTour ? "Recorrido: sí" : "Recorrido: no"}
          </button>
          <button
            type="button"
            onClick={() => setQuality((q) => (q === "high" ? "fast" : "high"))}
            className={`rounded-lg px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:py-1.5 sm:text-xs ${quality === "high" ? "bg-amber-700 text-white" : "text-slate-700 hover:bg-white"}`}
            title="Calidad alta: sombras suaves, oclusión y brillo. Rápida: para compus más modestas."
          >
            {quality === "high" ? "Calidad alta" : "Calidad rápida"}
          </button>
          {(
            [
              ["off", "Off"],
              ["zones", "Zonas"],
              ["seats", "Asientos"],
              ["selection", "Sel."],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onCoverageView(mode)}
              className={`rounded-lg px-2 py-1 text-[11px] font-medium sm:px-2.5 sm:py-1.5 sm:text-xs ${
                scene.coverageView === mode ? "bg-teal-800 text-white" : "text-slate-700 hover:bg-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {arOpen ? <ArModal name={projectName} buildModel={buildModel} onClose={() => setArOpen(false)} /> : null}

      {showHelp && sceneOk ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center px-3">
          <div className="rounded-full bg-slate-900/80 px-4 py-1.5 text-[11px] text-white shadow-lg backdrop-blur">
            Arrastrá para girar · rueda o pellizco para acercar · clic derecho o dos dedos para mover
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-1 sm:bottom-3 sm:left-3">
        <div className="rounded-md bg-slate-900/80 px-2 py-1 text-[10px] text-white sm:px-2.5 sm:py-1.5 sm:text-[11px]">
          {scene.widthM.toFixed(1)} × {scene.depthM.toFixed(1)} m · {scene.areaM2} m²
        </div>
      </div>
    </div>
  );
}
