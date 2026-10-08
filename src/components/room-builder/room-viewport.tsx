"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type {
  CameraPreset,
  CoverageViewMode,
  DeviceCoverage,
} from "@/services/room-builder/types";
import type { RoomScene, SceneDevice } from "@/services/room-builder/scene";

const PRESET_LABELS: Record<CameraPreset, string> = {
  general: "General",
  front_av: "Frente AV",
  plan: "Planta",
  detail: "Detalle",
  device_pov: "POV equipo",
};

function roleColor(role: string): string {
  switch (role) {
    case "display":
      return "#1e3553";
    case "camera":
      return "#0f766e";
    case "mic":
      return "#b45309";
    case "speaker":
      return "#7c3aed";
    case "touch":
      return "#0369a1";
    case "codec":
    case "processor":
      return "#475569";
    default:
      return "#64748b";
  }
}

function CameraRig({
  preset,
  widthM,
  depthM,
  heightM,
  selected,
}: {
  preset: CameraPreset;
  widthM: number;
  depthM: number;
  heightM: number;
  selected: SceneDevice | null;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<{
    target: THREE.Vector3;
    update: () => void;
  } | null>(null);

  const framing = useMemo(() => {
    const w = widthM;
    const d = depthM;
    const h = heightM;
    let position: [number, number, number];
    let target: [number, number, number];
    switch (preset) {
      case "plan":
        position = [0, Math.max(h * 2.4, 6), 0.01];
        target = [0, 0, 0];
        break;
      case "front_av":
        position = [0, h * 0.9, -d * 0.05];
        target = [0, h * 0.55, d / 2 - 0.2];
        break;
      case "detail":
        if (selected) {
          position = [
            selected.pose.x + 1.2,
            selected.pose.y + 0.6,
            selected.pose.z + 1.2,
          ];
          target = [selected.pose.x, selected.pose.y, selected.pose.z];
        } else {
          position = [w * 0.35, h * 0.85, d * 0.35];
          target = [0, h * 0.4, 0];
        }
        break;
      case "device_pov":
        if (selected) {
          position = [
            selected.pose.x,
            selected.pose.y + 0.15,
            selected.pose.z - 0.35,
          ];
          target = [selected.pose.x, selected.pose.y, selected.pose.z + 1.5];
        } else {
          position = [0, h * 0.7, -d * 0.1];
          target = [0, h * 0.5, d / 2];
        }
        break;
      case "general":
      default:
        position = [w * 0.55, h * 1.15, d * 0.7];
        target = [0, h * 0.35, 0];
        break;
    }
    return { position, target };
  }, [preset, widthM, depthM, heightM, selected]);

  useEffect(() => {
    camera.position.set(...framing.position);
    camera.lookAt(...framing.target);
    camera.updateProjectionMatrix();
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(...framing.target);
      controls.update();
    }
  }, [camera, framing]);

  return (
    <OrbitControls
      ref={controlsRef as never}
      makeDefault
      enableRotate={preset !== "plan"}
      enablePan={preset !== "plan"}
      minPolarAngle={preset === "plan" ? 0 : 0.25}
      maxPolarAngle={preset === "plan" ? 0.05 : Math.PI / 2.1}
      minAzimuthAngle={preset === "plan" ? 0 : -Infinity}
      maxAzimuthAngle={preset === "plan" ? 0 : Infinity}
      minDistance={1.2}
      maxDistance={Math.max(widthM, depthM) * 2.4}
    />
  );
}

function CategoryFurniture({
  category,
  widthM,
  depthM,
}: {
  category: string;
  widthM: number;
  depthM: number;
}) {
  if (category === "hotel") {
    return (
      <group>
        {/* bed */}
        <mesh position={[0, 0.35, -depthM * 0.15]} castShadow>
          <boxGeometry args={[Math.min(widthM * 0.55, 2.2), 0.4, Math.min(depthM * 0.45, 2)]} />
          <meshStandardMaterial color="#c4b5a0" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.62, -depthM * 0.28]}>
          <boxGeometry args={[Math.min(widthM * 0.55, 2.2), 0.35, 0.12]} />
          <meshStandardMaterial color="#8a735a" />
        </mesh>
        {/* nightstands */}
        <mesh position={[-Math.min(widthM * 0.35, 1.3), 0.25, -depthM * 0.05]}>
          <boxGeometry args={[0.45, 0.5, 0.4]} />
          <meshStandardMaterial color="#6b5540" />
        </mesh>
        <mesh position={[Math.min(widthM * 0.35, 1.3), 0.25, -depthM * 0.05]}>
          <boxGeometry args={[0.45, 0.5, 0.4]} />
          <meshStandardMaterial color="#6b5540" />
        </mesh>
      </group>
    );
  }
  if (category === "classroom" || category === "training") {
    const rows = category === "training" ? 4 : 3;
    return (
      <group>
        {Array.from({ length: rows }).map((_, row) => (
          <mesh
            key={row}
            position={[0, 0.4, -depthM * 0.25 + row * (depthM * 0.18)]}
            castShadow
          >
            <boxGeometry args={[Math.min(widthM * 0.7, 4), 0.05, 0.45]} />
            <meshStandardMaterial color="#d1d5db" />
          </mesh>
        ))}
        {/* teacher desk */}
        <mesh position={[0, 0.4, depthM * 0.28]} castShadow>
          <boxGeometry args={[1.4, 0.05, 0.7]} />
          <meshStandardMaterial color="#8b7355" />
        </mesh>
      </group>
    );
  }
  if (category === "lobby" || category === "signage") {
    return (
      <group>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[Math.min(widthM * 0.5, 2.4), 1, 0.7]} />
          <meshStandardMaterial color="#334155" roughness={0.6} />
        </mesh>
      </group>
    );
  }
  if (category === "event") {
    return (
      <group>
        <mesh position={[0, 0.4, depthM * 0.35]} castShadow>
          <boxGeometry args={[Math.min(widthM * 0.7, 6), 0.8, 1.2]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      </group>
    );
  }
  if (category === "residential") {
    return (
      <group>
        <mesh position={[0, 0.35, -depthM * 0.1]} castShadow>
          <boxGeometry args={[Math.min(widthM * 0.55, 2.6), 0.45, 0.9]} />
          <meshStandardMaterial color="#78716c" />
        </mesh>
        <mesh position={[-widthM * 0.25, 0.25, depthM * 0.15]}>
          <boxGeometry args={[0.7, 0.5, 0.7]} />
          <meshStandardMaterial color="#57534e" />
        </mesh>
      </group>
    );
  }
  // videoconference / default: conference table
  return (
    <group>
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry
          args={[
            Math.min(widthM * 0.45, 3.2),
            0.06,
            Math.min(depthM * 0.28, 1.4),
          ]}
        />
        <meshStandardMaterial color="#8b7355" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.12, 0.72, 0.12]} />
        <meshStandardMaterial color="#6b5540" />
      </mesh>
    </group>
  );
}

function RoomShell({
  widthM,
  depthM,
  heightM,
  plan,
  category,
}: {
  widthM: number;
  depthM: number;
  heightM: number;
  plan: RoomScene["plan"];
  category: string;
}) {
  const floor = useMemo(() => {
    if (category === "hotel") return new THREE.Color("#e7e0d5");
    if (category === "classroom" || category === "training")
      return new THREE.Color("#e5e7eb");
    if (category === "event") return new THREE.Color("#cbd5e1");
    return new THREE.Color("#d6dde6");
  }, [category]);

  if (plan?.enabled && plan.walls.length > 0) {
    return (
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[widthM * 1.2, depthM * 1.2]} />
          <meshStandardMaterial color={floor} roughness={0.92} metalness={0.02} />
        </mesh>
        {plan.walls.map((wall) => {
          const dx = wall.b.x - wall.a.x;
          const dz = wall.b.y - wall.a.y;
          const len = Math.hypot(dx, dz);
          const midX = (wall.a.x + wall.b.x) / 2;
          const midZ = (wall.a.y + wall.b.y) / 2;
          const rotY = Math.atan2(dx, dz);
          return (
            <mesh
              key={wall.id}
              position={[midX, heightM / 2, midZ]}
              rotation={[0, rotY, 0]}
            >
              <boxGeometry args={[0.1, heightM, len]} />
              <meshStandardMaterial color="#e8edf3" roughness={0.95} />
            </mesh>
          );
        })}
        <CategoryFurniture category={category} widthM={widthM} depthM={depthM} />
      </group>
    );
  }

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[widthM, depthM]} />
        <meshStandardMaterial color={floor} roughness={0.92} metalness={0.02} />
      </mesh>
      <mesh position={[0, heightM / 2, -depthM / 2]}>
        <boxGeometry args={[widthM, heightM, 0.08]} />
        <meshStandardMaterial color="#eef2f6" roughness={0.95} />
      </mesh>
      <mesh position={[-widthM / 2, heightM / 2, 0]}>
        <boxGeometry args={[0.08, heightM, depthM]} />
        <meshStandardMaterial color="#e8edf3" roughness={0.95} />
      </mesh>
      <mesh position={[widthM / 2, heightM / 2, 0]}>
        <boxGeometry args={[0.08, heightM, depthM]} />
        <meshStandardMaterial color="#e8edf3" roughness={0.95} />
      </mesh>
      <CategoryFurniture category={category} widthM={widthM} depthM={depthM} />
    </group>
  );
}

function CoverageCone({
  device,
  mode,
}: {
  device: SceneDevice;
  mode: CoverageViewMode;
}) {
  if (mode === "off") return null;
  if (mode === "selection") return null;
  const cov = device.coverage as DeviceCoverage | null;
  if (!cov || cov.source === "missing") return null;

  if (device.designRole === "camera" && cov.hfovDeg) {
    const range = cov.maxRangeM ?? 4;
    const angle = (cov.hfovDeg * Math.PI) / 180;
    return (
      <mesh
        position={[device.pose.x, device.pose.y, device.pose.z]}
        rotation={[0, (device.pose.rotY * Math.PI) / 180, 0]}
      >
        <coneGeometry args={[Math.tan(angle / 2) * range, range, 24, 1, true]} />
        <meshBasicMaterial
          color="#0f766e"
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    );
  }

  if (device.designRole === "mic" && cov.micRadiusM) {
    return (
      <mesh
        position={[device.pose.x, 0.02, device.pose.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[cov.micRadiusM, 48]} />
        <meshBasicMaterial
          color="#b45309"
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>
    );
  }

  return null;
}

function DeviceMesh({
  role,
  color,
  selected,
  placementTarget,
  onClick,
}: {
  role: string;
  color: string;
  selected: boolean;
  placementTarget?: boolean;
  onClick: (e: { stopPropagation: () => void }) => void;
}) {
  const mat = (
    <meshStandardMaterial
      color={placementTarget ? "#059669" : selected ? "#2563eb" : color}
      emissive={
        placementTarget ? "#047857" : selected ? "#1d4ed8" : "#000000"
      }
      emissiveIntensity={placementTarget ? 0.45 : selected ? 0.25 : 0}
      roughness={0.45}
      metalness={0.15}
    />
  );

  if (role === "display") {
    return (
      <mesh castShadow onClick={onClick}>
        <boxGeometry args={[1.35, 0.78, 0.07]} />
        {mat}
      </mesh>
    );
  }
  if (role === "camera") {
    return (
      <group onClick={onClick}>
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.18, 0.12, 0.16]} />
          {mat}
        </mesh>
        <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.06, 0.1, 16]} />
          {mat}
        </mesh>
      </group>
    );
  }
  if (role === "mic") {
    return (
      <mesh castShadow onClick={onClick}>
        <cylinderGeometry args={[0.16, 0.16, 0.05, 24]} />
        {mat}
      </mesh>
    );
  }
  if (role === "speaker") {
    return (
      <mesh castShadow onClick={onClick}>
        <cylinderGeometry args={[0.14, 0.14, 0.08, 24]} />
        {mat}
      </mesh>
    );
  }
  if (role === "touch") {
    return (
      <mesh castShadow onClick={onClick}>
        <boxGeometry args={[0.28, 0.18, 0.03]} />
        {mat}
      </mesh>
    );
  }
  if (role === "codec" || role === "processor") {
    return (
      <mesh castShadow onClick={onClick}>
        <boxGeometry args={[0.45, 0.09, 0.3]} />
        {mat}
      </mesh>
    );
  }
  return (
    <mesh castShadow onClick={onClick}>
      <boxGeometry args={[0.22, 0.16, 0.18]} />
      {mat}
    </mesh>
  );
}

function DeviceProxy({
  device,
  selected,
  placementTarget,
  onSelect,
  coverageView,
}: {
  device: SceneDevice;
  selected: boolean;
  placementTarget?: boolean;
  onSelect: (slotKey: string) => void;
  coverageView: CoverageViewMode;
}) {
  const color = roleColor(device.designRole);
  const showCoverage =
    coverageView === "zones" ||
    coverageView === "seats" ||
    (coverageView === "selection" && selected);

  return (
    <group
      position={[device.pose.x, device.pose.y, device.pose.z]}
      rotation={[0, (device.pose.rotY * Math.PI) / 180, 0]}
    >
      {placementTarget ? (
        <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.38, 32]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.85} />
        </mesh>
      ) : null}
      <DeviceMesh
        role={device.designRole}
        color={color}
        selected={selected}
        placementTarget={placementTarget}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(device.slotKey);
        }}
      />
      {selected || device.productId || placementTarget ? (
        <Html distanceFactor={8} position={[0, 0.35, 0]} center>
          <div
            className={`rounded px-2 py-1 text-[10px] font-medium text-white shadow whitespace-nowrap ${
              placementTarget ? "bg-emerald-700" : "bg-slate-900/90"
            }`}
          >
            {placementTarget
              ? `Ubicar aquí · ${device.label}`
              : device.productName || device.label}
          </div>
        </Html>
      ) : null}
      {showCoverage ? (
        <CoverageCone
          device={device}
          mode={selected && coverageView === "selection" ? "zones" : coverageView}
        />
      ) : null}
    </group>
  );
}

function SceneContent({
  scene,
  category,
  placementSlotKeys,
  onSelectSlot,
}: {
  scene: RoomScene;
  category: string;
  placementSlotKeys: string[];
  onSelectSlot: (slotKey: string) => void;
}) {
  const selected =
    scene.devices.find((d) => d.slotKey === scene.selectedSlotKey) ?? null;
  const placeSet = new Set(placementSlotKeys);

  return (
    <>
      <color attach="background" args={["#c5d0dc"]} />
      <fog attach="fog" args={["#c5d0dc", 12, 28]} />
      <ambientLight intensity={0.65} />
      <directionalLight
        castShadow
        position={[4, 8, 3]}
        intensity={1.15}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={["#f8fafc", "#94a3b8", 0.35]} />
      <RoomShell
        widthM={scene.widthM}
        depthM={scene.depthM}
        heightM={scene.heightM}
        plan={scene.plan}
        category={category}
      />
      {scene.devices.map((device) => (
        <DeviceProxy
          key={device.id}
          device={device}
          selected={device.slotKey === scene.selectedSlotKey}
          placementTarget={placeSet.has(device.slotKey)}
          onSelect={onSelectSlot}
          coverageView={scene.coverageView}
        />
      ))}
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.35}
        scale={Math.max(scene.widthM, scene.depthM) * 1.4}
        blur={2.2}
      />
      <CameraRig
        preset={scene.cameraPreset}
        widthM={scene.widthM}
        depthM={scene.depthM}
        heightM={scene.heightM}
        selected={selected}
      />
    </>
  );
}

export function RoomViewport({
  scene,
  category = "videoconference",
  placementSlotKeys = [],
  placementHint,
  onSelectSlot,
  onCameraPreset,
  onCoverageView,
}: {
  scene: RoomScene;
  category?: string;
  /** Slots verdes donde se puede ubicar el producto en mano */
  placementSlotKeys?: string[];
  placementHint?: string | null;
  onSelectSlot: (slotKey: string) => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onCoverageView: (mode: CoverageViewMode) => void;
}) {
  const presets = Object.keys(PRESET_LABELS) as CameraPreset[];

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
      <Canvas
        shadows
        camera={{ position: [4, 3, 5], fov: 42, near: 0.1, far: 80 }}
        gl={{ antialias: true }}
      >
        <SceneContent
          scene={scene}
          category={category}
          placementSlotKeys={placementSlotKeys}
          onSelectSlot={onSelectSlot}
        />
      </Canvas>

      {placementHint ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 z-10 flex justify-center px-3">
          <div className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white shadow-lg">
            {placementHint}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex flex-wrap gap-1 rounded-lg bg-white/90 p-1 shadow-sm backdrop-blur">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onCameraPreset(preset)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                scene.cameraPreset === preset
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-1 rounded-lg bg-white/90 p-1 shadow-sm backdrop-blur">
          {(
            [
              ["off", "Sin cobertura"],
              ["zones", "Zonas"],
              ["seats", "Asientos"],
              ["selection", "Selección"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onCoverageView(mode)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                scene.coverageView === mode
                  ? "bg-teal-800 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-slate-900/80 px-2.5 py-1.5 text-[11px] text-white">
        {scene.widthM.toFixed(1)} × {scene.depthM.toFixed(1)} m · {scene.areaM2} m²
      </div>
    </div>
  );
}
