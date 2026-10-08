"use client";

/**
 * Equipos en la escena: modelo por tipo, anillo de "ubicar acá" que late,
 * resaltado al pasar el mouse, ficha con la foto real del producto al
 * seleccionarlo y conos / círculos de cobertura.
 */

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";
import type { CoverageViewMode, DeviceCoverage } from "@/services/room-builder/types";
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

function DeviceBody({ device, heightM }: { device: SceneDevice; heightM: number }) {
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

export function SceneDeviceItem({
  device,
  heightM,
  selected,
  placementTarget,
  coverageView,
  onSelect,
}: {
  device: SceneDevice;
  heightM: number;
  selected: boolean;
  placementTarget: boolean;
  coverageView: CoverageViewMode;
  onSelect: (slotKey: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const showCoverage = coverageView === "zones" || coverageView === "seats" || (coverageView === "selection" && selected);
  const groundOffset = -device.pose.y + 0.02;

  return (
    <group
      position={[device.pose.x, device.pose.y, device.pose.z]}
      rotation={[0, (device.pose.rotY * Math.PI) / 180, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(device.slotKey);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
      scale={hover && !selected ? 1.04 : 1}
    >
      <DeviceBody device={device} heightM={heightM} />
      {placementTarget ? <PlacementRing y={groundOffset} /> : null}
      {selected ? (
        <group position={[0, groundOffset, 0]}>
          <SelectionHalo />
        </group>
      ) : null}
      {selected ? <ProductCard device={device} /> : null}
      {showCoverage ? <CoverageCone device={device} mode={coverageView} /> : null}
    </group>
  );
}
