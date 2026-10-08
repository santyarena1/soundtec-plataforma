"use client";

import type { ReactNode } from "react";
export { MAT } from "./room-theme";
import { MAT } from "./room-theme";

export function Box({
  args,
  position,
  rotation,
  color,
  roughness = 0.75,
  metalness = 0.05,
  emissive,
  emissiveIntensity = 0,
  castShadow = true,
  receiveShadow = false,
  onClick,
}: {
  args: [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  onClick?: (e: { stopPropagation: () => void }) => void;
}) {
  return (
    <mesh
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      onClick={onClick}
    >
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

export function Cyl({
  args,
  position,
  rotation,
  color,
  roughness = 0.7,
  metalness = 0.1,
  castShadow = true,
}: {
  args: [number, number, number, number?];
  position?: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
}) {
  const [rTop, rBot, h, seg = 24] = args;
  return (
    <mesh
      position={position}
      rotation={rotation}
      castShadow={castShadow}
    >
      <cylinderGeometry args={[rTop, rBot, h, seg]} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}

/** Silla de oficina / reunión */
export function Chair({
  x,
  z,
  rotY = 0,
  color = MAT.fabric,
}: {
  x: number;
  z: number;
  rotY?: number;
  color?: string;
}) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <Box args={[0.42, 0.05, 0.42]} position={[0, 0.45, 0]} color={color} />
      <Box
        args={[0.42, 0.42, 0.05]}
        position={[0, 0.68, -0.18]}
        color={color}
      />
      <Cyl
        args={[0.03, 0.03, 0.42]}
        position={[0, 0.22, 0]}
        color={MAT.metal}
      />
      <Cyl
        args={[0.22, 0.22, 0.03, 16]}
        position={[0, 0.04, 0]}
        color={MAT.metalDark}
      />
    </group>
  );
}

/** Silla de aula / banquetes (más simple) */
export function SideChair({
  x,
  z,
  rotY = 0,
  color = MAT.fabricLight,
}: {
  x: number;
  z: number;
  rotY?: number;
  color?: string;
}) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <Box args={[0.4, 0.04, 0.38]} position={[0, 0.42, 0]} color={color} />
      <Box args={[0.4, 0.38, 0.04]} position={[0, 0.62, -0.17]} color={color} />
      {(
        [
          [-0.16, -0.14],
          [0.16, -0.14],
          [-0.16, 0.14],
          [0.16, 0.14],
        ] as const
      ).map(([lx, lz], i) => (
        <Box
          key={i}
          args={[0.04, 0.42, 0.04]}
          position={[lx, 0.21, lz]}
          color={MAT.metal}
        />
      ))}
    </group>
  );
}

export function DeskTable({
  width,
  depth,
  x = 0,
  z = 0,
  y = 0.74,
  color = MAT.wood,
}: {
  width: number;
  depth: number;
  x?: number;
  z?: number;
  y?: number;
  color?: string;
}) {
  const leg = 0.06;
  const hw = width / 2 - 0.08;
  const hd = depth / 2 - 0.08;
  return (
    <group position={[x, 0, z]}>
      <Box args={[width, 0.05, depth]} position={[0, y, 0]} color={color} />
      {(
        [
          [-hw, -hd],
          [hw, -hd],
          [-hw, hd],
          [hw, hd],
        ] as const
      ).map(([lx, lz], i) => (
        <Box
          key={i}
          args={[leg, y - 0.02, leg]}
          position={[lx, (y - 0.02) / 2, lz]}
          color={MAT.woodDark}
        />
      ))}
    </group>
  );
}

export function RoundTable({
  radius,
  x = 0,
  z = 0,
  color = MAT.wood,
}: {
  radius: number;
  x?: number;
  z?: number;
  color?: string;
}) {
  return (
    <group position={[x, 0, z]}>
      <Cyl args={[radius, radius, 0.05, 32]} position={[0, 0.74, 0]} color={color} />
      <Cyl
        args={[0.08, 0.12, 0.7, 16]}
        position={[0, 0.37, 0]}
        color={MAT.woodDark}
      />
      <Cyl
        args={[radius * 0.35, radius * 0.35, 0.04, 24]}
        position={[0, 0.04, 0]}
        color={MAT.metalDark}
      />
    </group>
  );
}

export function Sofa({
  width,
  x,
  z,
  rotY = 0,
  color = MAT.fabricWarm,
}: {
  width: number;
  x: number;
  z: number;
  rotY?: number;
  color?: string;
}) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <Box args={[width, 0.35, 0.85]} position={[0, 0.28, 0]} color={color} />
      <Box
        args={[width, 0.45, 0.12]}
        position={[0, 0.55, -0.36]}
        color={color}
      />
      <Box
        args={[0.12, 0.35, 0.75]}
        position={[-width / 2 + 0.06, 0.45, 0.02]}
        color={color}
      />
      <Box
        args={[0.12, 0.35, 0.75]}
        position={[width / 2 - 0.06, 0.45, 0.02]}
        color={color}
      />
    </group>
  );
}

export function CoffeeTable({
  x,
  z,
  w = 1.1,
  d = 0.55,
}: {
  x: number;
  z: number;
  w?: number;
  d?: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <Box args={[w, 0.04, d]} position={[0, 0.38, 0]} color={MAT.woodLight} />
      <Box args={[0.06, 0.36, 0.06]} position={[-w / 2 + 0.08, 0.18, -d / 2 + 0.08]} color={MAT.metal} />
      <Box args={[0.06, 0.36, 0.06]} position={[w / 2 - 0.08, 0.18, -d / 2 + 0.08]} color={MAT.metal} />
      <Box args={[0.06, 0.36, 0.06]} position={[-w / 2 + 0.08, 0.18, d / 2 - 0.08]} color={MAT.metal} />
      <Box args={[0.06, 0.36, 0.06]} position={[w / 2 - 0.08, 0.18, d / 2 - 0.08]} color={MAT.metal} />
    </group>
  );
}

export function Bed({
  width,
  depth,
  x = 0,
  z = 0,
}: {
  width: number;
  depth: number;
  x?: number;
  z?: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <Box
        args={[width + 0.08, 0.28, depth + 0.08]}
        position={[0, 0.2, 0]}
        color={MAT.woodDark}
      />
      <Box
        args={[width, 0.22, depth]}
        position={[0, 0.4, 0]}
        color={MAT.cream}
        roughness={0.95}
      />
      <Box
        args={[width + 0.08, 0.55, 0.1]}
        position={[0, 0.5, -depth / 2]}
        color={MAT.woodDark}
      />
      <Box
        args={[width * 0.42, 0.12, 0.28]}
        position={[-width * 0.22, 0.56, -depth / 2 + 0.25]}
        color={MAT.white}
      />
      <Box
        args={[width * 0.42, 0.12, 0.28]}
        position={[width * 0.22, 0.56, -depth / 2 + 0.25]}
        color={MAT.white}
      />
    </group>
  );
}

export function Nightstand({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box args={[0.45, 0.5, 0.4]} position={[0, 0.25, 0]} color={MAT.woodDark} />
      <Cyl
        args={[0.08, 0.1, 0.02, 16]}
        position={[0, 0.52, 0]}
        color={MAT.metal}
      />
    </group>
  );
}

export function MediaConsole({
  width,
  x,
  z,
  rotY = 0,
}: {
  width: number;
  x: number;
  z: number;
  rotY?: number;
}) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <Box args={[width, 0.45, 0.4]} position={[0, 0.22, 0]} color={MAT.woodDark} />
      <Box
        args={[width * 0.9, 0.02, 0.02]}
        position={[0, 0.35, 0.2]}
        color={MAT.metal}
      />
    </group>
  );
}

export function ReceptionDesk({
  width,
  depth,
  x = 0,
  z = 0,
}: {
  width: number;
  depth: number;
  x?: number;
  z?: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <Box args={[width, 1.05, depth]} position={[0, 0.52, 0]} color={MAT.metalDark} />
      <Box
        args={[width + 0.08, 0.06, depth + 0.08]}
        position={[0, 1.08, 0]}
        color={MAT.woodLight}
      />
      <Box
        args={[width * 0.5, 0.35, 0.02]}
        position={[0, 0.7, depth / 2 + 0.01]}
        color={MAT.screenLit}
        emissive={MAT.screenLit}
        emissiveIntensity={0.35}
      />
    </group>
  );
}

export function Stage({
  width,
  depth,
  x = 0,
  z = 0,
  height = 0.45,
}: {
  width: number;
  depth: number;
  x?: number;
  z?: number;
  height?: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <Box
        args={[width, height, depth]}
        position={[0, height / 2, 0]}
        color={MAT.stage}
        roughness={0.9}
      />
      <Box
        args={[width * 0.95, 0.02, depth * 0.9]}
        position={[0, height + 0.01, 0]}
        color="#111827"
        roughness={0.95}
      />
    </group>
  );
}

export function BarCounter({
  width,
  x = 0,
  z = 0,
}: {
  width: number;
  x?: number;
  z?: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <Box args={[width, 1.05, 0.7]} position={[0, 0.52, 0]} color={MAT.woodDark} />
      <Box
        args={[width + 0.1, 0.06, 0.85]}
        position={[0, 1.08, 0.05]}
        color={MAT.wood}
      />
    </group>
  );
}

export function BarStool({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Cyl args={[0.18, 0.18, 0.05, 16]} position={[0, 0.72, 0]} color={MAT.fabric} />
      <Cyl args={[0.03, 0.03, 0.7, 12]} position={[0, 0.35, 0]} color={MAT.metal} />
      <Cyl
        args={[0.2, 0.2, 0.03, 16]}
        position={[0, 0.03, 0]}
        color={MAT.metalDark}
      />
    </group>
  );
}

export function Lectern({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box args={[0.7, 1.05, 0.5]} position={[0, 0.52, 0]} color={MAT.woodDark} />
      <Box
        args={[0.75, 0.04, 0.45]}
        position={[0, 1.08, 0.05]}
        rotation={[-0.25, 0, 0]}
        color={MAT.wood}
      />
    </group>
  );
}

export function Whiteboard({
  width,
  height,
  x,
  y,
  z,
  rotY = 0,
}: {
  width: number;
  height: number;
  x: number;
  y: number;
  z: number;
  rotY?: number;
}) {
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      <Box args={[width, height, 0.04]} color={MAT.white} roughness={0.4} />
      <Box
        args={[width + 0.06, height + 0.06, 0.02]}
        position={[0, 0, -0.02]}
        color={MAT.metal}
      />
    </group>
  );
}

export function RackCabinet({
  x,
  z,
  rotY = 0,
  tall = true,
}: {
  x: number;
  z: number;
  rotY?: number;
  tall?: boolean;
}) {
  const h = tall ? 1.8 : 1.1;
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <Box args={[0.55, h, 0.7]} position={[0, h / 2, 0]} color={MAT.black} />
      {Array.from({ length: tall ? 8 : 5 }).map((_, i) => (
        <Box
          key={i}
          args={[0.48, 0.04, 0.02]}
          position={[0, 0.25 + i * 0.18, 0.36]}
          color={i % 3 === 0 ? "#22c55e" : MAT.metal}
          emissive={i % 3 === 0 ? "#16a34a" : undefined}
          emissiveIntensity={i % 3 === 0 ? 0.4 : 0}
        />
      ))}
    </group>
  );
}

export function Planter({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <Cyl args={[0.22, 0.18, 0.35, 16]} position={[0, 0.18, 0]} color={MAT.metalDark} />
      <Cyl args={[0.16, 0.2, 0.4, 12]} position={[0, 0.5, 0]} color="#3f6212" />
    </group>
  );
}

export function Credenza({
  width,
  x,
  z,
  rotY = 0,
}: {
  width: number;
  x: number;
  z: number;
  rotY?: number;
}) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <Box args={[width, 0.7, 0.45]} position={[0, 0.35, 0]} color={MAT.wood} />
    </group>
  );
}

export function LoungeChair({
  x,
  z,
  rotY = 0,
}: {
  x: number;
  z: number;
  rotY?: number;
}) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <Box args={[0.7, 0.3, 0.7]} position={[0, 0.28, 0]} color={MAT.fabricWarm} />
      <Box
        args={[0.7, 0.5, 0.12]}
        position={[0, 0.55, -0.28]}
        color={MAT.fabricWarm}
      />
    </group>
  );
}

export function ControlConsole({
  width,
  x,
  z,
}: {
  width: number;
  x: number;
  z: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <Box args={[width, 0.75, 0.9]} position={[0, 0.38, 0]} color={MAT.metalDark} />
      <Box
        args={[width * 0.95, 0.04, 0.55]}
        position={[0, 0.85, 0.1]}
        rotation={[-0.35, 0, 0]}
        color={MAT.black}
      />
      {[-0.35, 0, 0.35].map((ox, i) => (
        <Box
          key={i}
          args={[0.28, 0.18, 0.02]}
          position={[ox * width * 0.35, 0.95, 0.22]}
          rotation={[-0.35, 0, 0]}
          color={MAT.screenLit}
          emissive={MAT.screenLit}
          emissiveIntensity={0.5}
        />
      ))}
    </group>
  );
}

export function Group({
  children,
  position,
  rotation,
}: {
  children: ReactNode;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      {children}
    </group>
  );
}
