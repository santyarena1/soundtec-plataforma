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
import { TypologyFurniture } from "./scene-furniture";
import { Box, MAT } from "./scene-primitives";
import { roomTheme } from "./room-theme";

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
      return "#475569";
    case "touch":
      return "#0369a1";
    case "codec":
    case "processor":
      return "#334155";
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
        position = [0, Math.max(h * 2.6, 7), 0.01];
        target = [0, 0, 0];
        break;
      case "front_av":
        position = [0, h * 0.85, -d * 0.15];
        target = [0, h * 0.55, d / 2 - 0.15];
        break;
      case "detail":
        if (selected) {
          position = [
            selected.pose.x + 1.35,
            selected.pose.y + 0.55,
            selected.pose.z + 1.35,
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
            selected.pose.y + 0.12,
            selected.pose.z - 0.4,
          ];
          target = [selected.pose.x, selected.pose.y, selected.pose.z + 1.8];
        } else {
          position = [0, h * 0.7, -d * 0.1];
          target = [0, h * 0.5, d / 2];
        }
        break;
      case "general":
      default:
        position = [w * 0.62, h * 1.05, d * 0.78];
        target = [0, h * 0.32, 0];
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
      maxPolarAngle={preset === "plan" ? 0.05 : Math.PI / 2.15}
      minAzimuthAngle={preset === "plan" ? 0 : -Infinity}
      maxAzimuthAngle={preset === "plan" ? 0 : Infinity}
      minDistance={1.2}
      maxDistance={Math.max(widthM, depthM) * 2.6}
    />
  );
}

function WindowPanel({
  width,
  height,
  position,
  rotation,
}: {
  width: number;
  height: number;
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <Box
        args={[width + 0.08, height + 0.08, 0.06]}
        color={MAT.metal}
        castShadow={false}
      />
      <mesh>
        <boxGeometry args={[width, height, 0.03]} />
        <meshStandardMaterial
          color={MAT.glass}
          transparent
          opacity={0.45}
          roughness={0.15}
          metalness={0.2}
          emissive="#bfdbfe"
          emissiveIntensity={0.25}
        />
      </mesh>
      {/* montante */}
      <Box
        args={[0.04, height, 0.05]}
        color={MAT.metal}
        castShadow={false}
      />
    </group>
  );
}

function RoomShell({
  widthM,
  depthM,
  heightM,
  plan,
  category,
  templateKey,
}: {
  widthM: number;
  depthM: number;
  heightM: number;
  plan: RoomScene["plan"];
  category: string;
  templateKey: string;
}) {
  const theme = useMemo(
    () => roomTheme(category, templateKey),
    [category, templateKey],
  );
  const t = 0.1; // espesor muro

  if (plan?.enabled && plan.walls.length > 0) {
    return (
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[widthM * 1.3, depthM * 1.3]} />
          <meshStandardMaterial color={theme.floor} roughness={0.92} />
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
              <meshStandardMaterial color={theme.wall} roughness={0.95} />
            </mesh>
          );
        })}
        <TypologyFurniture
          templateKey={templateKey}
          category={category}
          widthM={widthM}
          depthM={depthM}
        />
      </group>
    );
  }

  return (
    <group>
      {/* piso exterior */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
      >
        <planeGeometry args={[widthM * 1.8, depthM * 1.8]} />
        <meshStandardMaterial
          color={theme.outdoor ? "#6b7f5e" : "#b0bac6"}
          roughness={1}
        />
      </mesh>

      {/* piso interior */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[widthM, depthM]} />
        <meshStandardMaterial
          color={theme.floor}
          roughness={theme.outdoor ? 0.85 : 0.92}
          metalness={0.02}
        />
      </mesh>

      {/* techo */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, heightM, 0]}
        receiveShadow
      >
        <planeGeometry args={[widthM, depthM]} />
        <meshStandardMaterial color={theme.ceiling} roughness={0.98} />
      </mesh>

      {/* muro trasero (−Z) */}
      <Box
        args={[widthM + t, heightM, t]}
        position={[0, heightM / 2, -depthM / 2]}
        color={theme.wall}
        castShadow={false}
        receiveShadow
      />
      {/* muro frontal / AV (+Z) */}
      <Box
        args={[widthM + t, heightM, t]}
        position={[0, heightM / 2, depthM / 2]}
        color={theme.wallFront}
        castShadow={false}
        receiveShadow
      />
      {/* muro izquierdo */}
      <Box
        args={[t, heightM, depthM]}
        position={[-widthM / 2, heightM / 2, 0]}
        color={theme.wall}
        castShadow={false}
        receiveShadow
      />
      {/* muro derecho */}
      <Box
        args={[t, heightM, depthM]}
        position={[widthM / 2, heightM / 2, 0]}
        color={theme.wall}
        castShadow={false}
        receiveShadow
      />

      {/* zócalos */}
      {(
        [
          [0, 0.05, -depthM / 2 + 0.06, widthM, 0.1, 0.04],
          [0, 0.05, depthM / 2 - 0.06, widthM, 0.1, 0.04],
          [-widthM / 2 + 0.06, 0.05, 0, 0.04, 0.1, depthM],
          [widthM / 2 - 0.06, 0.05, 0, 0.04, 0.1, depthM],
        ] as const
      ).map(([x, y, z, w, h, d], i) => (
        <Box
          key={i}
          args={[w, h, d]}
          position={[x, y, z]}
          color={theme.trim}
          castShadow={false}
        />
      ))}

      {/* ventanas laterales (excepto control-room / event oscuros) */}
      {category !== "control-room" && category !== "event" ? (
        <>
          <WindowPanel
            width={Math.min(depthM * 0.35, 1.6)}
            height={Math.min(heightM * 0.45, 1.3)}
            position={[
              -widthM / 2 + 0.06,
              heightM * 0.55,
              -depthM * 0.15,
            ]}
            rotation={[0, Math.PI / 2, 0]}
          />
          <WindowPanel
            width={Math.min(depthM * 0.35, 1.6)}
            height={Math.min(heightM * 0.45, 1.3)}
            position={[widthM / 2 - 0.06, heightM * 0.55, -depthM * 0.15]}
            rotation={[0, -Math.PI / 2, 0]}
          />
        </>
      ) : null}

      {/* puerta en muro trasero */}
      <Box
        args={[0.95, 2.1, 0.06]}
        position={[-widthM * 0.28, 1.05, -depthM / 2 + 0.04]}
        color="#cbd5e1"
        castShadow={false}
      />
      <Box
        args={[1.05, 2.2, 0.04]}
        position={[-widthM * 0.28, 1.1, -depthM / 2 + 0.01]}
        color={theme.trim}
        castShadow={false}
      />

      <TypologyFurniture
        templateKey={templateKey}
        category={category}
        widthM={widthM}
        depthM={depthM}
      />
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
  if (mode === "off" || mode === "selection") return null;
  const cov = device.coverage as DeviceCoverage | null;
  if (!cov || cov.source === "missing") return null;

  if (device.designRole === "camera" && cov.hfovDeg) {
    const range = cov.maxRangeM ?? 4;
    const angle = (cov.hfovDeg * Math.PI) / 180;
    return (
      <mesh
        position={[device.pose.x, device.pose.y, device.pose.z]}
        rotation={[0, (device.pose.rotY * Math.PI) / 180, Math.PI]}
      >
        <coneGeometry args={[Math.tan(angle / 2) * range, range, 28, 1, true]} />
        <meshBasicMaterial
          color="#0f766e"
          transparent
          opacity={0.16}
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
          opacity={0.18}
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
  const accent = placementTarget ? "#059669" : selected ? "#2563eb" : color;
  const emissive = placementTarget
    ? "#047857"
    : selected
      ? "#1d4ed8"
      : "#000000";
  const ei = placementTarget ? 0.45 : selected ? 0.28 : 0;

  if (role === "display") {
    return (
      <group onClick={onClick}>
        {/* bisel */}
        <mesh castShadow>
          <boxGeometry args={[1.55, 0.9, 0.06]} />
          <meshStandardMaterial
            color={placementTarget ? accent : MAT.black}
            roughness={0.35}
            metalness={0.4}
            emissive={emissive}
            emissiveIntensity={ei}
          />
        </mesh>
        {/* pantalla */}
        <mesh position={[0, 0, 0.035]}>
          <boxGeometry args={[1.42, 0.78, 0.02]} />
          <meshStandardMaterial
            color={MAT.screenLit}
            emissive={MAT.screenLit}
            emissiveIntensity={placementTarget ? 0.2 : 0.55}
            roughness={0.25}
          />
        </mesh>
        {/* soporte pared */}
        <mesh position={[0, -0.15, -0.05]}>
          <boxGeometry args={[0.35, 0.12, 0.08]} />
          <meshStandardMaterial color={MAT.metal} metalness={0.5} />
        </mesh>
      </group>
    );
  }

  if (role === "camera") {
    return (
      <group onClick={onClick}>
        <mesh castShadow>
          <boxGeometry args={[0.22, 0.12, 0.14]} />
          <meshStandardMaterial
            color={accent}
            emissive={emissive}
            emissiveIntensity={ei}
            roughness={0.4}
            metalness={0.35}
          />
        </mesh>
        <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.055, 0.1, 20]} />
          <meshStandardMaterial color={MAT.black} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.15]}>
          <sphereGeometry args={[0.035, 16, 16]} />
          <meshStandardMaterial
            color="#0ea5e9"
            emissive="#0284c7"
            emissiveIntensity={0.5}
            roughness={0.2}
          />
        </mesh>
      </group>
    );
  }

  if (role === "mic") {
    return (
      <group onClick={onClick}>
        <mesh castShadow>
          <cylinderGeometry args={[0.18, 0.2, 0.06, 28]} />
          <meshStandardMaterial
            color={accent}
            emissive={emissive}
            emissiveIntensity={ei}
            roughness={0.55}
          />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.2, 8]} />
          <meshStandardMaterial color={MAT.metal} />
        </mesh>
        <mesh position={[0, -0.02, 0]}>
          <torusGeometry args={[0.12, 0.015, 8, 24]} />
          <meshStandardMaterial color={MAT.metalDark} />
        </mesh>
      </group>
    );
  }

  if (role === "speaker") {
    return (
      <group onClick={onClick}>
        <mesh castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.08, 28]} />
          <meshStandardMaterial
            color={accent}
            emissive={emissive}
            emissiveIntensity={ei}
            roughness={0.6}
          />
        </mesh>
        <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.04, 0.12, 24]} />
          <meshStandardMaterial color={MAT.metalDark} />
        </mesh>
      </group>
    );
  }

  if (role === "touch") {
    return (
      <group onClick={onClick}>
        <mesh castShadow rotation={[-0.4, 0, 0]}>
          <boxGeometry args={[0.32, 0.22, 0.025]} />
          <meshStandardMaterial
            color={MAT.black}
            emissive={emissive}
            emissiveIntensity={ei}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[0, 0.01, 0.02]} rotation={[-0.4, 0, 0]}>
          <boxGeometry args={[0.28, 0.18, 0.01]} />
          <meshStandardMaterial
            color={accent}
            emissive={MAT.screenLit}
            emissiveIntensity={0.45}
          />
        </mesh>
        <mesh position={[0, -0.12, -0.02]}>
          <cylinderGeometry args={[0.025, 0.04, 0.12, 12]} />
          <meshStandardMaterial color={MAT.metal} />
        </mesh>
      </group>
    );
  }

  if (role === "codec" || role === "processor") {
    return (
      <group onClick={onClick}>
        <mesh castShadow>
          <boxGeometry args={[0.48, role === "processor" ? 0.14 : 0.09, 0.32]} />
          <meshStandardMaterial
            color={accent}
            emissive={emissive}
            emissiveIntensity={ei}
            roughness={0.4}
            metalness={0.35}
          />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[-0.16 + i * 0.1, 0.02, 0.165]}>
            <sphereGeometry args={[0.012, 10, 10]} />
            <meshStandardMaterial
              color={i === 0 ? "#22c55e" : "#38bdf8"}
              emissive={i === 0 ? "#16a34a" : "#0284c7"}
              emissiveIntensity={0.7}
            />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <mesh castShadow onClick={onClick}>
      <boxGeometry args={[0.22, 0.16, 0.18]} />
      <meshStandardMaterial
        color={accent}
        emissive={emissive}
        emissiveIntensity={ei}
      />
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
        <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.42, 36]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.9} />
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
        <Html distanceFactor={8} position={[0, 0.42, 0]} center>
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
          mode={
            selected && coverageView === "selection" ? "zones" : coverageView
          }
        />
      ) : null}
    </group>
  );
}

function SceneContent({
  scene,
  category,
  templateKey,
  placementSlotKeys,
  onSelectSlot,
}: {
  scene: RoomScene;
  category: string;
  templateKey: string;
  placementSlotKeys: string[];
  onSelectSlot: (slotKey: string) => void;
}) {
  const selected =
    scene.devices.find((d) => d.slotKey === scene.selectedSlotKey) ?? null;
  const placeSet = new Set(placementSlotKeys);
  const theme = useMemo(
    () => roomTheme(category, templateKey),
    [category, templateKey],
  );

  return (
    <>
      <color attach="background" args={[theme.fog]} />
      <fog attach="fog" args={[theme.fog, 14, 32]} />
      <ambientLight intensity={theme.ambient} />
      <directionalLight
        castShadow
        position={[5, 9, 4]}
        intensity={1.25}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={40}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <hemisphereLight args={["#f8fafc", "#64748b", 0.4]} />
      {/* luz de ventana */}
      <pointLight
        position={[-scene.widthM * 0.4, scene.heightM * 0.7, 0]}
        intensity={0.35}
        color="#bfdbfe"
        distance={10}
      />
      <RoomShell
        widthM={scene.widthM}
        depthM={scene.depthM}
        heightM={scene.heightM}
        plan={scene.plan}
        category={category}
        templateKey={templateKey}
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
        opacity={0.4}
        scale={Math.max(scene.widthM, scene.depthM) * 1.5}
        blur={2.4}
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
  templateKey,
  placementSlotKeys = [],
  placementHint,
  onSelectSlot,
  onCameraPreset,
  onCoverageView,
}: {
  scene: RoomScene;
  category?: string;
  templateKey?: string;
  placementSlotKeys?: string[];
  placementHint?: string | null;
  onSelectSlot: (slotKey: string) => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onCoverageView: (mode: CoverageViewMode) => void;
}) {
  const presets = Object.keys(PRESET_LABELS) as CameraPreset[];
  const resolvedKey = templateKey || scene.templateKey || category;

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
      <Canvas
        shadows
        camera={{ position: [4, 3, 5], fov: 40, near: 0.1, far: 90 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <SceneContent
          scene={scene}
          category={category}
          templateKey={resolvedKey}
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

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1">
        <div className="rounded-md bg-slate-900/80 px-2.5 py-1.5 text-[11px] text-white">
          {scene.widthM.toFixed(1)} × {scene.depthM.toFixed(1)} m ·{" "}
          {scene.areaM2} m²
        </div>
        <div className="rounded-md bg-white/85 px-2 py-1 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur">
          {resolvedKey}
        </div>
      </div>
    </div>
  );
}
