"use client";

/**
 * Objetos de ambientación: cuadros, lámpara de pie y los detalles que viajan
 * con cada mueble (almohadones, notebook, monitor, libros, florero, centro de
 * mesa, lámpara de mesa de luz, almohadas). Paleta de interiorismo actual:
 * neutros cálidos con acentos salvia, terracota, ocre y azul pizarra.
 */

import { RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { FurnitureItem } from "@/services/room-builder/furnishing";
import { MAT } from "../room-theme";
import { useSurface } from "./surfaces";

/** Acentos de textiles y objetos. */
const ACCENTS = ["#9aab94", "#c9876a", "#d4a85a", "#4f5d6e", "#e8dfd0", "#b9a48c"];
const accent = (i: number) => ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length]!;

/** Alturas de apoyo de cada mueble (m), iguales a sus modelos. */
const TOP_TABLE = 0.74;
const TOP_TABLE_PRIMITIVE = 0.765;
const TOP_COFFEE = 0.4;
const TOP_NIGHTSTAND = 0.5;
const TOP_RECEPTION = 1.05;
const MATTRESS_TOP = 0.51;
const SOFA_SEAT_TOP = 0.49;

/* ── Cuadros ── */

/** Obra abstracta pintada en un canvas (estable por variante). */
function useArtTexture(variant: number, w: number, h: number) {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const px = 512;
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = Math.round((px * h) / w);
    const g = canvas.getContext("2d");
    if (!g) return null;
    const W = canvas.width;
    const H = canvas.height;
    const bg = ["#efe9df", "#e6e1d7", "#f2eee8", "#dcd6cc"][variant % 4]!;
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const c1 = accent(variant);
    const c2 = accent(variant + 2);
    const c3 = accent(variant + 3);
    switch (variant % 4) {
      case 0: // arco y sol
        g.fillStyle = c1;
        g.beginPath();
        g.arc(W * 0.42, H * 0.95, W * 0.3, Math.PI, 0);
        g.fill();
        g.fillStyle = c2;
        g.beginPath();
        g.arc(W * 0.68, H * 0.32, W * 0.12, 0, Math.PI * 2);
        g.fill();
        break;
      case 1: // bloques superpuestos
        g.globalAlpha = 0.92;
        g.fillStyle = c1;
        g.fillRect(W * 0.12, H * 0.18, W * 0.42, H * 0.6);
        g.fillStyle = c3;
        g.fillRect(W * 0.4, H * 0.36, W * 0.46, H * 0.48);
        g.globalAlpha = 1;
        g.strokeStyle = "#2a2c30";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(W * 0.08, H * 0.88);
        g.lineTo(W * 0.92, H * 0.88);
        g.stroke();
        break;
      case 2: // horizonte
        g.fillStyle = c2;
        g.fillRect(0, H * 0.58, W, H * 0.42);
        g.fillStyle = c1;
        g.beginPath();
        g.ellipse(W * 0.5, H * 0.58, W * 0.36, H * 0.16, 0, Math.PI, 0);
        g.fill();
        g.fillStyle = bg;
        g.globalAlpha = 0.35;
        for (let i = 0; i < 6; i++) g.fillRect(0, H * (0.64 + i * 0.06), W, 2);
        g.globalAlpha = 1;
        break;
      default: // trazo orgánico
        g.strokeStyle = c3;
        g.lineCap = "round";
        g.lineWidth = W * 0.07;
        g.beginPath();
        g.moveTo(W * 0.2, H * 0.75);
        g.bezierCurveTo(W * 0.3, H * 0.1, W * 0.7, H * 0.95, W * 0.82, H * 0.25);
        g.stroke();
        g.fillStyle = c1;
        g.beginPath();
        g.arc(W * 0.3, H * 0.3, W * 0.08, 0, Math.PI * 2);
        g.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [variant, w, h]);
}

/** Cuadro con marco fino y paspartú. Frente hacia +z, centrado en su origen. */
export function WallArt({ w, h, variant = 0 }: { w: number; h: number; variant?: number }) {
  const frame = useSurface(variant % 2 ? MAT.woodLight : MAT.black);
  const mat = useSurface("#f7f5f1", 0.9, 0);
  const border = Math.min(w, h) * 0.08;
  const tex = useArtTexture(variant, w - border * 2, h - border * 2);
  return (
    <group>
      <mesh material={frame} castShadow>
        <boxGeometry args={[w, h, 0.035]} />
      </mesh>
      <mesh position={[0, 0, 0.018]} material={mat}>
        <boxGeometry args={[w - 0.04, h - 0.04, 0.002]} />
      </mesh>
      <mesh position={[0, 0, 0.0205]}>
        <planeGeometry args={[w - border * 2, h - border * 2]} />
        <meshStandardMaterial map={tex ?? undefined} color={tex ? "#ffffff" : accent(variant)} roughness={0.85} />
      </mesh>
    </group>
  );
}

/* ── Lámparas ── */

/** Pantalla de lino encendida (brilla suave). */
function Shade({ radius, height, y }: { radius: number; height: number; y: number }) {
  return (
    <mesh position={[0, y, 0]} castShadow>
      <cylinderGeometry args={[radius * 0.85, radius, height, 32, 1, true]} />
      <meshStandardMaterial color="#f3ece0" emissive="#ffe6c4" emissiveIntensity={0.28} side={THREE.DoubleSide} roughness={0.9} />
    </mesh>
  );
}

/** Lámpara de pie: base redonda, varilla negra y pantalla de lino. */
export function FloorLamp() {
  const metal = useSurface(MAT.metalDark);
  return (
    <group>
      <mesh position={[0, 0.012, 0]} material={metal} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.17, 0.024, 32]} />
      </mesh>
      <mesh position={[0, 0.78, 0]} material={metal} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 1.52, 12]} />
      </mesh>
      <Shade radius={0.2} height={0.3} y={1.5} />
    </group>
  );
}

function TableLamp({ y }: { y: number }) {
  const ceramic = useSurface("#e9e3d8", 0.4, 0);
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0.12, 0]} material={ceramic} castShadow>
        <sphereGeometry args={[0.1, 24, 16]} />
      </mesh>
      <Shade radius={0.15} height={0.2} y={0.32} />
    </group>
  );
}

/** Tótem de cartelería: marco fino de aluminio negro, pantalla vertical encendida y base de acero. */
export function SignageTotem() {
  const frame = useSurface(MAT.metalDark);
  const base = useSurface("#2f3134", 0.35, 0.6);
  return (
    <group>
      <mesh position={[0, 0.015, 0]} material={base} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.03, 0.42]} />
      </mesh>
      <mesh position={[0, 0.98, 0]} material={frame} castShadow>
        <boxGeometry args={[0.6, 1.9, 0.07]} />
      </mesh>
      <mesh position={[0, 1.1, 0.0355]}>
        <planeGeometry args={[0.54, 0.96 * 1.6]} />
        <meshStandardMaterial color="#1b2633" emissive="#6d8fb8" emissiveIntensity={0.45} roughness={0.2} />
      </mesh>
    </group>
  );
}

/* ── Objetos sobre muebles ── */

function Books({ y, x = 0, z = 0, rot = 0, n = 3, seed = 0 }: { y: number; x?: number; z?: number; rot?: number; n?: number; seed?: number }) {
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      {Array.from({ length: n }, (_, i) => (
        <Book key={i} i={i} seed={seed} />
      ))}
    </group>
  );
}

function Book({ i, seed }: { i: number; seed: number }) {
  const cover = useSurface(accent(seed + i * 2), 0.7, 0);
  const t = 0.035 - i * 0.004;
  const w = 0.24 - i * 0.02;
  return (
    <mesh position={[0, 0.0175 + i * 0.034, 0]} rotation={[0, i * 0.18, 0]} material={cover} castShadow>
      <boxGeometry args={[w, t, w * 0.72]} />
    </mesh>
  );
}

/** Florero de cerámica con ramas. */
function Vase({ y, x = 0, z = 0, tall = 0.22, seed = 0 }: { y: number; x?: number; z?: number; tall?: number; seed?: number }) {
  const ceramic = useSurface(["#e9e3d8", "#2f3134", "#c9876a"][seed % 3]!, 0.35, 0);
  const stem = useSurface("#6f7a5e", 0.8, 0);
  const leaf = useSurface("#8fa37f", 0.7, 0);
  const points = useMemo(
    () => [0, 0.35, 0.5, 0.48, 0.32, 0.26, 0.3].map((r, k, arr) => new THREE.Vector2(Math.max(0.001, r * tall * 0.5), (k / (arr.length - 1)) * tall)),
    [tall],
  );
  return (
    <group position={[x, y, z]}>
      <mesh material={ceramic} castShadow>
        <latheGeometry args={[points, 28]} />
      </mesh>
      {/* Ramas finas con hojas alargadas a lo largo (eucalipto / olivo). */}
      {[-0.32, 0.05, 0.38, -0.12, 0.25].map((a, k) => (
        <group key={k} position={[0, tall * 0.95, 0]} rotation={[a * 0.6, k * 1.26, a]}>
          <mesh position={[0, tall * 0.6, 0]} material={stem}>
            <cylinderGeometry args={[0.0025, 0.0035, tall * 1.2, 5]} />
          </mesh>
          {[0.35, 0.6, 0.85, 1.1].map((t, j) => (
            <mesh key={j} position={[(j % 2 ? 1 : -1) * 0.014, tall * t, 0]} rotation={[0, 0, (j % 2 ? -1 : 1) * 0.9]} scale={[0.32, 1, 0.14]} material={leaf} castShadow>
              <sphereGeometry args={[0.03, 8, 6]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Notebook abierta, mirando hacia +z (hacia quien la usa). */
function Laptop({ y, z = 0, x = 0, facing = 0 }: { y: number; x?: number; z?: number; facing?: number }) {
  const body = useSurface("#c7cacf", 0.3, 0.8);
  return (
    <group position={[x, y, z]} rotation={[0, facing, 0]}>
      <mesh position={[0, 0.008, 0]} material={body} castShadow>
        <boxGeometry args={[0.32, 0.016, 0.22]} />
      </mesh>
      <group position={[0, 0.016, -0.11]} rotation={[-0.32, 0, 0]}>
        <mesh position={[0, 0.105, 0]} material={body} castShadow>
          <boxGeometry args={[0.32, 0.21, 0.008]} />
        </mesh>
        <mesh position={[0, 0.105, 0.0045]}>
          <planeGeometry args={[0.29, 0.18]} />
          <meshStandardMaterial color="#1c2733" emissive="#5d7ea6" emissiveIntensity={0.35} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/** Monitor de escritorio sobre pie, mirando hacia +z. */
function DeskMonitor({ y, z = 0, x = 0, facing = 0 }: { y: number; x?: number; z?: number; facing?: number }) {
  const dark = useSurface(MAT.black);
  return (
    <group position={[x, y, z]} rotation={[0, facing, 0]}>
      <mesh position={[0, 0.006, 0]} material={dark} castShadow>
        <boxGeometry args={[0.22, 0.012, 0.16]} />
      </mesh>
      <mesh position={[0, 0.16, -0.02]} material={dark} castShadow>
        <boxGeometry args={[0.04, 0.3, 0.02]} />
      </mesh>
      <mesh position={[0, 0.3, 0]} material={dark} castShadow>
        <boxGeometry args={[0.62, 0.36, 0.025]} />
      </mesh>
      <mesh position={[0, 0.3, 0.0135]}>
        <planeGeometry args={[0.6, 0.34]} />
        <meshStandardMaterial color="#1a2430" emissive="#46668f" emissiveIntensity={0.3} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** Jarra y vasos sobre bandeja (mesa de reunión). */
function WaterSet({ y }: { y: number }) {
  const tray = useSurface(MAT.woodDark);
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#eef4f6", roughness: 0.05, transmission: 0.9, thickness: 0.01, transparent: true, opacity: 0.55 }), []);
  return (
    <group position={[0, y, 0]}>
      <RoundedBox args={[0.42, 0.02, 0.26]} radius={0.008} smoothness={2} position={[0, 0.01, 0]} material={tray} castShadow />
      <mesh position={[-0.1, 0.13, 0]} material={glass}>
        <cylinderGeometry args={[0.045, 0.05, 0.22, 20]} />
      </mesh>
      {[0.05, 0.13].map((x) => (
        <mesh key={x} position={[x, 0.07, 0.04 - x * 0.3]} material={glass}>
          <cylinderGeometry args={[0.03, 0.026, 0.1, 16]} />
        </mesh>
      ))}
    </group>
  );
}

/** Almohadón inclinado contra el respaldo (frente hacia +z). */
function Cushion({ x, y, z, color, size = 0.42, tilt = -0.32, spin = 0 }: { x: number; y: number; z: number; color: string; size?: number; tilt?: number; spin?: number }) {
  const fabric = useSurface(MAT.fabric, undefined, undefined, color);
  return <RoundedBox args={[size, size, 0.13]} radius={0.06} smoothness={4} position={[x, y, z]} rotation={[tilt, spin, 0]} material={fabric} castShadow />;
}

function BedDressing({ w, d, seed }: { w: number; d: number; seed: number }) {
  const linen = useSurface(MAT.fabric, undefined, undefined, "#f6f3ee");
  const throwMat = useSurface(MAT.fabric, undefined, undefined, accent(seed + 1));
  const pillows = w >= 1.3 ? [-w / 4, w / 4] : [0];
  return (
    <group>
      {pillows.map((x) => (
        <RoundedBox key={x} args={[Math.min(0.62, w / pillows.length - 0.08), 0.14, 0.4]} radius={0.06} smoothness={4} position={[x, MATTRESS_TOP + 0.08, -d / 2 + 0.32]} rotation={[-0.25, 0, 0]} material={linen} castShadow />
      ))}
      <RoundedBox args={[w + 0.06, 0.03, 0.55]} radius={0.012} smoothness={2} position={[0, MATTRESS_TOP + 0.015, d / 2 - 0.4]} material={throwMat} castShadow receiveShadow />
    </group>
  );
}

const isRect = (item: FurnitureItem) => !item.shape;

/** Detalles sobre cada mueble, en coordenadas del mueble (mismo origen y giro). */
export function FurnitureProps({ item }: { item: FurnitureItem }) {
  const w = item.w ?? 1;
  const d = item.d ?? 0.6;
  const seed = item.variant ?? Math.abs([...item.id].reduce((s, ch) => s + ch.charCodeAt(0), 0));
  const seat = item.seat ?? 1;
  const facing = seat > 0 ? 0 : Math.PI;
  switch (item.kind) {
    case "desk": {
      if (w < 0.8 || d < 0.4) return null;
      const top = item.shape ? TOP_TABLE : TOP_TABLE_PRIMITIVE;
      const deep = d >= 0.65 && w >= 1.1;
      return (
        <group>
          <Laptop y={top} x={deep ? -w * 0.12 : 0} z={seat * (deep ? 0.1 : 0.04)} facing={facing} />
          {deep ? <DeskMonitor y={top} x={w * 0.12} z={-seat * (d / 2 - 0.2)} facing={facing} /> : null}
          <Vase y={top} x={(deep ? -1 : 1) * (w / 2 - 0.14)} z={-seat * (d / 2 - 0.14)} tall={0.14} seed={seed} />
        </group>
      );
    }
    case "conference-table":
      if (w < 1.1 || d < 0.7) return null;
      return (
        <group>
          <WaterSet y={item.shape ? TOP_TABLE : TOP_TABLE_PRIMITIVE} />
          {w >= 2 ? <Vase y={item.shape ? TOP_TABLE : TOP_TABLE_PRIMITIVE} x={w * 0.22} tall={0.18} seed={seed} /> : null}
        </group>
      );
    case "round-table":
      return <Vase y={item.shape ? TOP_TABLE : TOP_TABLE_PRIMITIVE} tall={0.2} seed={seed} />;
    case "coffee-table": {
      const cw = item.w ?? 1.1;
      return (
        <group>
          <Books y={TOP_COFFEE} x={-cw * 0.2} rot={0.2} seed={seed} />
          <Vase y={TOP_COFFEE} x={cw * 0.22} tall={0.2} seed={seed + 1} />
        </group>
      );
    }
    case "nightstand":
      return <TableLamp y={TOP_NIGHTSTAND} />;
    case "reception-desk":
      if (!isRect(item)) return null;
      return <Vase y={TOP_RECEPTION} x={w / 2 - 0.3} tall={0.24} seed={seed} />;
    case "bed":
      return <BedDressing w={w} d={d} seed={seed} />;
    case "sofa": {
      if (!isRect(item)) return null;
      const sw = item.w ?? 1.8;
      const z = -0.92 / 2 + 0.2 + 0.17 + 0.07;
      const x = sw / 2 - 0.17 - 0.24;
      return (
        <group>
          <Cushion x={-x} y={SOFA_SEAT_TOP + 0.2} z={z} color={accent(seed)} spin={0.12} />
          <Cushion x={x} y={SOFA_SEAT_TOP + 0.2} z={z} color={accent(seed + 2)} spin={-0.12} />
          {sw >= 2.2 ? <Cushion x={x - 0.36} y={SOFA_SEAT_TOP + 0.18} z={z + 0.04} color={accent(seed + 4)} size={0.36} spin={-0.2} /> : null}
        </group>
      );
    }
    case "lounge-chair":
      if (!isRect(item)) return null;
      return <Cushion x={0} y={SOFA_SEAT_TOP + 0.18} z={-0.41 + 0.2 + 0.17 + 0.07} color={accent(seed + 1)} size={0.36} />;
    default:
      return null;
  }
}
