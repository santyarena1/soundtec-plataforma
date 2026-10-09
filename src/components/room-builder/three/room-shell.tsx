"use client";

/**
 * Sala: piso, paredes, techo, zócalos, ventanas, puerta y luces embutidas,
 * con materiales PBR. Las paredes que quedan entre la cámara y la sala se
 * ocultan solas (vista de maqueta), y el techo cuando la cámara está arriba:
 * así se puede girar libremente sin que nada tape la vista.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { RoomScene } from "@/services/room-builder/scene";
import { roomTheme } from "../room-theme";
import { useLargeSurface, useSurface, type TextureSetName } from "./surfaces";

const WALL_T = 0.12;

/** Piso según la tipología. */
export function floorSetFor(category: string, templateKey: string): { set: TextureSetName; roughness: number } {
  if (templateKey === "hotel-pool-bar-m" || templateKey === "residential-outdoor-m") return { set: "concrete", roughness: 0.8 };
  if (templateKey === "residential-cinema-m") return { set: "carpet", roughness: 1 };
  if (templateKey === "restaurant-m") return { set: "walnut", roughness: 0.5 };
  if (templateKey === "retail-store-m") return { set: "concrete", roughness: 0.35 };
  if (templateKey === "restroom-s") return { set: "marble", roughness: 0.2 };
  if (category === "office") return { set: "carpet", roughness: 1 };
  if (category === "common") return { set: "concrete", roughness: 0.5 };
  if (category === "residential" || category === "hotel") return { set: "oak", roughness: 0.45 };
  if (category === "lobby") return { set: "marble", roughness: 0.18 };
  if (category === "signage" || category === "control-room") return { set: "concrete", roughness: 0.6 };
  return { set: "carpet", roughness: 1 };
}

type WallSide = "back" | "front" | "left" | "right";

/** Pared que se oculta cuando la cámara queda de su lado de afuera. */
function Wall({
  side,
  w,
  d,
  h,
  material,
  children,
}: {
  side: WallSide;
  w: number;
  d: number;
  h: number;
  material: THREE.Material;
  /** Ventanas / puerta montadas en esta pared: se ocultan junto con ella. */
  children?: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const { position, size } = useMemo(() => {
    switch (side) {
      case "back":
        return { position: [0, h / 2, -d / 2 - WALL_T / 2] as const, size: [w + WALL_T * 2, h, WALL_T] as const };
      case "front":
        return { position: [0, h / 2, d / 2 + WALL_T / 2] as const, size: [w + WALL_T * 2, h, WALL_T] as const };
      case "left":
        return { position: [-w / 2 - WALL_T / 2, h / 2, 0] as const, size: [WALL_T, h, d] as const };
      case "right":
        return { position: [w / 2 + WALL_T / 2, h / 2, 0] as const, size: [WALL_T, h, d] as const };
    }
  }, [side, w, d, h]);

  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    const p = camera.position;
    const outside =
      (side === "back" && p.z < -d / 2) ||
      (side === "front" && p.z > d / 2) ||
      (side === "left" && p.x < -w / 2) ||
      (side === "right" && p.x > w / 2);
    if (g.visible === outside) g.visible = !outside;
  });

  return (
    <group ref={ref}>
      <mesh position={position as unknown as [number, number, number]} receiveShadow material={material}>
        <boxGeometry args={size as unknown as [number, number, number]} />
      </mesh>
      <Skirting side={side} w={w} d={d} />
      {children}
    </group>
  );
}

function Skirting({ side, w, d }: { side: WallSide; w: number; d: number }) {
  const mat = useSurface("#f3f4f6", 0.5, 0);
  const H = 0.08;
  const T = 0.015;
  const props =
    side === "back"
      ? { position: [0, H / 2, -d / 2 + T / 2], size: [w, H, T] }
      : side === "front"
        ? { position: [0, H / 2, d / 2 - T / 2], size: [w, H, T] }
        : side === "left"
          ? { position: [-w / 2 + T / 2, H / 2, 0], size: [T, H, d] }
          : { position: [w / 2 - T / 2, H / 2, 0], size: [T, H, d] };
  return (
    <mesh position={props.position as [number, number, number]} material={mat}>
      <boxGeometry args={props.size as [number, number, number]} />
    </mesh>
  );
}

/** Techo + luces embutidas; se oculta cuando la cámara está por encima. */
function Ceiling({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  const mat = useSurface(color, 0.95, 0);
  const lights = useMemo(() => {
    const cols = Math.max(2, Math.round(w / 1.8));
    const rows = Math.max(2, Math.round(d / 1.8));
    const out: [number, number][] = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        out.push([-w / 2 + (w / cols) * (i + 0.5), -d / 2 + (d / rows) * (j + 0.5)]);
      }
    }
    return out;
  }, [w, d]);

  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    const show = camera.position.y < h - 0.05;
    if (g.visible !== show) g.visible = show;
  });

  return (
    // La maqueta exportada va sin techo, para verla por dentro.
    <group ref={ref} userData={{ noExport: true }}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, h, 0]} material={mat}>
        <planeGeometry args={[w, d]} />
      </mesh>
      {lights.map(([x, z], i) => (
        <group key={i} position={[x, h - 0.004, z]}>
          {/* aro */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.075, 0.095, 32]} />
            <meshStandardMaterial color="#d9dde2" metalness={0.6} roughness={0.3} side={THREE.DoubleSide} />
          </mesh>
          {/* difusor encendido (brilla con el bloom) */}
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
            <circleGeometry args={[0.075, 32]} />
            <meshBasicMaterial color={[3.2, 3.0, 2.7]} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function WindowPanel({
  width,
  height,
  position,
  rotationY,
}: {
  width: number;
  height: number;
  position: [number, number, number];
  rotationY: number;
}) {
  const frame = useSurface("#2b2f36", 0.4, 0.6);
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#dfeefe",
        roughness: 0.05,
        metalness: 0,
        transmission: 0.6,
        transparent: true,
        opacity: 0.55,
        emissive: new THREE.Color("#cfe6ff"),
        emissiveIntensity: 0.9,
      }),
    [],
  );
  const f = 0.05;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh material={glass}>
        <planeGeometry args={[width, height]} />
      </mesh>
      {[
        [0, height / 2 + f / 2, width + f * 2, f],
        [0, -height / 2 - f / 2, width + f * 2, f],
      ].map(([x, y, sw, sh], i) => (
        <mesh key={`h${i}`} position={[x, y, 0.01]} material={frame}>
          <boxGeometry args={[sw, sh, 0.07]} />
        </mesh>
      ))}
      {[-width / 2 - f / 2, 0, width / 2 + f / 2].map((x, i) => (
        <mesh key={`v${i}`} position={[x, 0, 0.01]} material={frame}>
          <boxGeometry args={[i === 1 ? f * 0.6 : f, height, 0.07]} />
        </mesh>
      ))}
    </group>
  );
}

function Door({ x, d }: { x: number; d: number }) {
  const leaf = useSurface("#8b7355", 0.5, 0);
  const frame = useSurface("#f1f2f4", 0.45, 0);
  const handle = useSurface("#9aa4b2", 0.25, 0.9);
  const z = -d / 2 + 0.035;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.05, 0]} material={leaf} castShadow>
        <boxGeometry args={[0.9, 2.1, 0.045]} />
      </mesh>
      <mesh position={[0, 1.1, -0.01]} material={frame}>
        <boxGeometry args={[1.02, 2.2, 0.03]} />
      </mesh>
      <mesh position={[0.36, 1.02, 0.04]} rotation={[0, 0, Math.PI / 2]} material={handle}>
        <cylinderGeometry args={[0.012, 0.012, 0.13, 16]} />
      </mesh>
    </group>
  );
}

export function RoomShell({
  widthM: w,
  depthM: d,
  heightM: h,
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
  const theme = roomTheme(category, templateKey);
  const floorSpec = floorSetFor(category, templateKey);
  const floorTint = floorSpec.set === "carpet" ? theme.floor : "#ffffff";
  const floor = useLargeSurface(floorSpec.set, floorTint, floorSpec.roughness, [w, d]);
  const wallMat = useLargeSurface("plaster", theme.wall, 0.92, [Math.max(w, d), h]);
  const accentMat = useLargeSurface("plaster", theme.wallFront, 0.9, [w, h]);
  const outdoorGround = useSurface(theme.outdoor ? "#6f7f62" : "#c3c9d0", 1, 0);
  const windows = category !== "control-room" && category !== "event";
  const winW = Math.min(d * 0.45, 2.2);
  const winH = Math.min(h * 0.5, 1.5);

  if (plan?.enabled && plan.walls.length > 0) {
    return (
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={floor}>
          <planeGeometry args={[w * 1.3, d * 1.3]} />
        </mesh>
        {plan.walls.map((wall) => {
          const dx = wall.b.x - wall.a.x;
          const dz = wall.b.y - wall.a.y;
          const len = Math.hypot(dx, dz);
          return (
            <mesh
              key={wall.id}
              position={[(wall.a.x + wall.b.x) / 2, h / 2, (wall.a.y + wall.b.y) / 2]}
              rotation={[0, Math.atan2(dx, dz), 0]}
              receiveShadow
              material={wallMat}
            >
              <boxGeometry args={[WALL_T, h, len]} />
            </mesh>
          );
        })}
      </group>
    );
  }

  return (
    <group>
      {/* terreno alrededor (solo se ve en la vista de maqueta) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow material={outdoorGround} userData={{ noExport: true }}>
        <planeGeometry args={[w * 4, d * 4]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={floor}>
        <planeGeometry args={[w, d]} />
      </mesh>
      <Wall side="back" w={w} d={d} h={h} material={wallMat}>
        <Door x={-w * 0.28} d={d} />
      </Wall>
      <Wall side="front" w={w} d={d} h={h} material={accentMat} />
      <Wall side="left" w={w} d={d} h={h} material={wallMat}>
        {windows ? <WindowPanel width={winW} height={winH} position={[-w / 2 + 0.005, h * 0.55, -d * 0.12]} rotationY={Math.PI / 2} /> : null}
      </Wall>
      <Wall side="right" w={w} d={d} h={h} material={wallMat}>
        {windows ? <WindowPanel width={winW} height={winH} position={[w / 2 - 0.005, h * 0.55, -d * 0.12]} rotationY={-Math.PI / 2} /> : null}
      </Wall>
      <Ceiling w={w} d={d} h={h} color={theme.ceiling} />
    </group>
  );
}
