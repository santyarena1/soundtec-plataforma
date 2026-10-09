"use client";

/**
 * Equipos en la escena: modelo por tipo, anillo de "ubicar acá" que late,
 * resaltado al pasar el mouse, ficha con la foto real del producto al
 * seleccionarlo y conos / círculos de cobertura.
 */

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { CopyPlus, RotateCw, Trash2 } from "lucide-react";
import * as THREE from "three";
import type { CoverageViewMode, DeviceCoverage, MountOption, Pose, RoomSlot } from "@/services/room-builder/types";
import { MAX_UNITS, clampPoseToRoom, normalizeDeviceUnits, type DeviceUnit, type RoomDims } from "@/services/room-builder/units";
import { useSurfaceDrag } from "./use-surface-drag";
import type { SceneDevice } from "@/services/room-builder/scene";
import {
  CameraModel,
  DisplayModel,
  GenericModel,
  MicModel,
  RackBoxModel,
  SpeakerModel,
  TouchModel,
  inchesFromProxy,
} from "./device-models";
import { ProductPhotoModel } from "./product-photo";

/** Altura hasta la que un equipo se considera apoyado (mesa, mueble, rack). */
const SURFACE_MAX_Y = 1.3;

function GenericBody({ device, heightM }: { device: SceneDevice; heightM: number }) {
  const y = device.pose.y;
  const nearCeiling = y > heightM - 0.45;
  switch (device.designRole) {
    case "display":
      return <DisplayModel inches={inchesFromProxy(device.proxyKey)} />;
    case "camera":
      return <CameraModel />;
    case "mic":
      return <MicModel ceiling={device.proxyKey === "ceiling_mic" || nearCeiling} />;
    case "speaker":
      return <SpeakerModel ceiling={device.proxyKey === "ceiling_speaker" || nearCeiling} />;
    case "touch":
      return <TouchModel onTable={y < 1.2} />;
    case "codec":
    case "processor":
      return <RackBoxModel tall={device.designRole === "processor" || device.proxyKey === "rack_processor"} />;
    default:
      return <GenericModel />;
  }
}

/** Con producto asignado se ve su foto real a escala; si no, el modelo del tipo. */
function DeviceBody({ device, heightM }: { device: SceneDevice; heightM: number }) {
  const generic = <GenericBody device={device} heightM={heightM} />;
  // Pantallas: modelo 3D encendido. Accesorios de la cadena (bom_*): no tienen lugar propio en la sala.
  if (!device.productId || device.designRole === "display" || device.slotKey.startsWith("bom_")) return generic;
  const y = device.pose.y;
  const ceiling = device.proxyKey === "ceiling_speaker" || device.proxyKey === "ceiling_mic" || y > heightM - 0.45;
  const placement = ceiling ? "ceiling" : y < SURFACE_MAX_Y ? "surface" : "wall";
  return (
    <ProductPhotoModel
      productId={device.productId}
      sizeCm={device.sizeCm}
      role={device.designRole}
      placement={placement}
      fallback={generic}
    />
  );
}

/** Anillo verde que late: "este producto se puede ubicar acá". */
function PlacementRing({ y }: { y: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.08;
    m.scale.set(s, s, s);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(clock.elapsedTime * 3) * 0.25;
  });
  return (
    <mesh ref={ref} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.28, 0.36, 48]} />
      <meshBasicMaterial color={[0.1, 1.6, 0.8]} transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

/** Halo azul del equipo seleccionado. */
function SelectionHalo() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = clock.elapsedTime * 0.6;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <ringGeometry args={[0.3, 0.33, 64, 1, 0, Math.PI * 1.6]} />
      <meshBasicMaterial color={[0.3, 0.7, 2.4]} toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function CoverageCone({ device, mode }: { device: SceneDevice; mode: CoverageViewMode }) {
  if (mode === "off") return null;
  const cov = device.coverage as DeviceCoverage | null;
  if (!cov || cov.source === "missing") return null;
  if (device.designRole === "camera" && cov.hfovDeg) {
    const range = cov.maxRangeM ?? 4;
    const angle = (cov.hfovDeg * Math.PI) / 180;
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, range / 2]}>
        <coneGeometry args={[Math.tan(angle / 2) * range, range, 48, 1, true]} />
        <meshBasicMaterial color="#14b8a6" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    );
  }
  if (device.designRole === "mic" && cov.micRadiusM) {
    return (
      <mesh position={[0, -device.pose.y + 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[cov.micRadiusM * 0.97, cov.micRadiusM, 64]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    );
  }
  return null;
}

function ProductCard({ device }: { device: SceneDevice }) {
  return (
    <Html position={[0, 0.35, 0]} center distanceFactor={undefined} zIndexRange={[20, 0]}>
      <div className="pointer-events-none w-56 -translate-y-full overflow-hidden rounded-xl border border-white/60 bg-white/95 shadow-2xl backdrop-blur">
        {device.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={device.imageUrl} alt="" className="h-28 w-full bg-white object-contain p-2" draggable={false} />
        ) : null}
        <div className="border-t border-slate-100 px-3 py-2">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{device.brandName || device.label}</p>
          <p className="truncate text-sm font-semibold text-slate-900">{device.productName || device.label}</p>
          {!device.productName ? <p className="text-[11px] text-amber-700">Sin producto asignado</p> : null}
        </div>
      </div>
    </Html>
  );
}

type UnitAction = "rotate" | "duplicate" | "remove";

/** Mueble técnico bajo los equipos de rack (que no queden flotando). */
function RackStand({ height }: { height: number }) {
  if (height < 0.1) return null;
  return (
    <group position={[0, -height / 2 - 0.025, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.6, height, 0.5]} />
        <meshStandardMaterial color="#1d2025" roughness={0.6} metalness={0.3} />
      </mesh>
      {Array.from({ length: Math.max(1, Math.floor(height / 0.12)) }, (_, i) => (
        <mesh key={i} position={[0, height / 2 - 0.08 - i * 0.12, 0.252]}>
          <boxGeometry args={[0.5, 0.012, 0.004]} />
          <meshStandardMaterial color="#3a3f47" />
        </mesh>
      ))}
    </group>
  );
}

/** Barra de acciones de la unidad seleccionada. */
function UnitToolbar({ canRotate, canRemove, onAction }: { canRotate: boolean; canRemove: boolean; onAction: (a: UnitAction) => void }) {
  const btn = "flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-35";
  return (
    <Html position={[0, -0.28, 0]} center zIndexRange={[30, 0]}>
      <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-xl backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
        {canRotate ? (
          <button type="button" className={btn} onClick={() => onAction("rotate")} title="Girar 45°">
            <RotateCw className="h-3.5 w-3.5" /> Girar
          </button>
        ) : null}
        <button type="button" className={btn} onClick={() => onAction("duplicate")} title="Agregar otro igual al lado">
          <CopyPlus className="h-3.5 w-3.5" /> Duplicar
        </button>
        <button type="button" className={`${btn} hover:text-red-600`} disabled={!canRemove} onClick={() => onAction("remove")} title="Quitar esta unidad">
          <Trash2 className="h-3.5 w-3.5" /> Quitar
        </button>
      </div>
    </Html>
  );
}

/** Una unidad física: se elige con click y se arrastra por las superficies que admite su montaje. */
function UnitItem({
  device,
  unit,
  mount,
  dims,
  selected,
  primary,
  placementTarget,
  coverageView,
  canRemove,
  onSelect,
  onCommit,
  onAction,
}: {
  device: SceneDevice;
  unit: DeviceUnit;
  mount: MountOption;
  dims: RoomDims;
  selected: boolean;
  primary: boolean;
  placementTarget: boolean;
  coverageView: CoverageViewMode;
  canRemove: boolean;
  onSelect: () => void;
  onCommit: (pose: Pose) => void;
  onAction: (a: UnitAction) => void;
}) {
  const [hover, setHover] = useState(false);
  const [dragPose, setDragPose] = useState<Pose | null>(null);
  const pose = dragPose ?? unit.pose;
  const showCoverage = coverageView === "zones" || coverageView === "seats" || (coverageView === "selection" && selected);
  const groundOffset = -pose.y + 0.02;

  const startDrag = useSurfaceDrag({
    mount,
    dims,
    keepY: unit.pose.y,
    keepRotation: unit.pose.rotY,
    onSelect,
    onMove: setDragPose,
    onCommit: (p) => {
      setDragPose(null);
      onCommit(p);
    },
  });

  return (
    <group
      position={[pose.x, pose.y, pose.z]}
      rotation={[0, (pose.rotY * Math.PI) / 180, 0]}
      onPointerDown={startDrag}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = selected ? "grab" : "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
      scale={hover && !selected ? 1.04 : 1}
    >
      <DeviceBody device={{ ...device, pose }} heightM={dims.heightM} />
      {mount === "rack" ? <RackStand height={pose.y - 0.03} /> : null}
      {placementTarget ? <PlacementRing y={groundOffset} /> : null}
      {selected ? (
        <group position={[0, groundOffset, 0]}>
          <SelectionHalo />
        </group>
      ) : null}
      {selected && primary && !dragPose ? <ProductCard device={device} /> : null}
      {selected && !dragPose ? <UnitToolbar canRotate={mount !== "wall" && mount !== "ceiling"} canRemove={canRemove} onAction={onAction} /> : null}
      {showCoverage ? <CoverageCone device={{ ...device, pose }} mode={coverageView} /> : null}
    </group>
  );
}

const DUPLICATE_OFFSET_M = 0.45;

/** Todas las unidades de un equipo, con sus acciones (mover, girar, duplicar, quitar). */
export function SceneDeviceUnits({
  device,
  slot,
  dims,
  selected,
  selectedUnitId,
  placementTarget,
  coverageView,
  onSelect,
  onSelectUnit,
  onUnitsChange,
  others,
}: {
  device: SceneDevice;
  slot: RoomSlot | undefined;
  dims: RoomDims;
  selected: boolean;
  selectedUnitId: string | null;
  placementTarget: boolean;
  coverageView: CoverageViewMode;
  onSelect: (slotKey: string) => void;
  onSelectUnit: (unitId: string) => void;
  onUnitsChange?: (slotKey: string, units: DeviceUnit[]) => void;
  /** Unidades de otros equipos en la misma superficie (para no encimarse). */
  others?: Pose[];
}) {
  const normalized = useMemo(() => normalizeDeviceUnits(device, slot, dims, others), [device, slot, dims, others]);
  const units = normalized.units ?? [];
  const mount = (slot?.mount ?? "wall") as MountOption;
  const activeId = selected ? (selectedUnitId && units.some((u) => u.id === selectedUnitId) ? selectedUnitId : units[0]?.id) : null;

  const commit = (next: DeviceUnit[]) => onUnitsChange?.(device.slotKey, next);

  function act(unit: DeviceUnit, action: UnitAction) {
    if (action === "rotate") {
      commit(units.map((u) => (u.id === unit.id ? { ...u, placed: true, pose: { ...u.pose, rotY: (u.pose.rotY + 45) % 360 } } : u)));
      return;
    }
    if (action === "duplicate") {
      if (units.length >= MAX_UNITS) return;
      const sideways = Math.abs(unit.pose.rotY) === 90 ? { z: unit.pose.z + DUPLICATE_OFFSET_M } : { x: unit.pose.x + DUPLICATE_OFFSET_M };
      const id = `${device.slotKey}#c${units.length}-${Math.round(performance.now()) % 100000}`;
      commit([...units, { id, placed: true, pose: clampPoseToRoom({ ...unit.pose, ...sideways }, dims) }]);
      onSelectUnit(id);
      return;
    }
    if (units.length > 1) commit(units.filter((u) => u.id !== unit.id));
  }

  return (
    <>
      {units.map((unit, i) => (
        <UnitItem
          key={unit.id}
          device={normalized}
          unit={unit}
          mount={mount}
          dims={dims}
          selected={activeId === unit.id}
          primary={i === 0 || activeId === unit.id}
          placementTarget={placementTarget && i === 0}
          coverageView={coverageView}
          canRemove={units.length > 1}
          onSelect={() => {
            onSelect(device.slotKey);
            onSelectUnit(unit.id);
          }}
          onCommit={(pose) => commit(units.map((u) => (u.id === unit.id ? { ...u, pose, placed: true } : u)))}
          onAction={(a) => act(unit, a)}
        />
      ))}
    </>
  );
}
