"use client";

/**
 * Muebles y objetos de la sala, editables: tocás uno para elegirlo y después
 * lo arrastrás, lo girás o lo quitás. Los que tapa una pantalla (pizarrón
 * detrás de una TV) no se dibujan.
 */

import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { RotateCw, Trash2 } from "lucide-react";
import type { FurnitureItem, FurnitureOverrides, ResolvedFurniture } from "@/services/room-builder/furnishing";
import type { Pose } from "@/services/room-builder/types";
import type { RoomDims } from "@/services/room-builder/units";
import {
  BarCounter,
  BarStool,
  Bed,
  ControlConsole,
  Credenza,
  Lectern,
  MAT,
  MediaConsole,
  Nightstand,
  RackCabinet,
  RoundTable,
  Stage,
  Whiteboard,
} from "../scene-primitives";
import { MODELS, ModelOr } from "./models";
import { BenchSeat, DiningChair, OfficeChair, Ottoman, Wardrobe, PlanterBox, PottedPlant, Rug, ShapedCounter, ShapedSofa, ShapedTable, SideTable, rectShape } from "./plan-models";
import { useSurfaceDrag } from "./use-surface-drag";
import { FloorLamp, FurnitureProps, SignageTotem, WallArt } from "./decor-models";

const ROTATE_STEP = Math.PI / 4;
/** Medidas de los sillones de tipología (m). */
const SOFA_DEPTH = 0.92;
const LOUNGE_SIZE = 0.82;
/** Butaca: tela salvia que acompaña a los sillones claros. */
const LOUNGE_FABRIC = "#c3cbbf";
/** Placard de tipología (m), igual que su contorno en planta. */
const WARDROBE_W = 0.55;
const WARDROBE_D = 0.7;
/** Movimiento máximo (px) para que un toque cuente como click. */
const CLICK_SLOP_PX = 4;

function ScreenFace({ w, h, z = 0 }: { w: number; h: number; z?: number }) {
  return (
    <mesh position={[0, 0, z]}>
      <boxGeometry args={[w, h, 0.03]} />
      <meshStandardMaterial color={MAT.screenLit} emissive={MAT.screenLit} emissiveIntensity={0.5} />
    </mesh>
  );
}

/**
 * Medida nominal (ancho × profundidad, m) de los modelos que no se dibujan a
 * medida: para que un mueble del plano llene justo su contorno dibujado.
 */
const NOMINAL: Partial<Record<FurnitureItem["kind"], [number, number]>> = {
  "lounge-chair": [0.8, 0.8],
  "side-chair": [0.5, 0.5],
  chair: [0.6, 0.6],
  "bar-stool": [0.42, 0.42],
  toilet: [0.4, 0.68],
  wardrobe: [0.55, 0.7],
  nightstand: [0.45, 0.4],
  lectern: [0.6, 0.5],
};
/** Rango de estiramiento de un modelo real: más allá se ve deforme. */
const FIT_MIN = 0.75;
const FIT_MAX = 1.35;

/** Escala para que el modelo coincida con el contorno del plano (solo muebles reconocidos del plano). */
/** Modelos que ya toman el ancho del plano pero tienen profundidad fija. */
const NOMINAL_DEPTH: Partial<Record<FurnitureItem["kind"], number>> = { sofa: 0.9, credenza: 0.45, "media-console": 0.45 };

function fitScale(item: FurnitureItem): [number, number, number] {
  // Los muebles con forma propia y las plantas ya se arman a su medida.
  if (item.shape || item.kind === "planter" || (item.fit && item.kind === "wardrobe")) return [1, 1, 1];
  const depth = NOMINAL_DEPTH[item.kind];
  if (item.fit && depth && item.d) return [1, 1, Math.min(FIT_MAX, Math.max(FIT_MIN, item.d / depth))];
  const nominal = NOMINAL[item.kind];
  if (!item.fit || !nominal || !item.w || !item.d) return [1, 1, 1];
  const clamp = (v: number) => Math.min(FIT_MAX, Math.max(FIT_MIN, v));
  const sx = clamp(item.w / nominal[0]);
  const sz = clamp(item.d / nominal[1]);
  return [sx, 1, sz];
}

/** Dibujo de cada tipo, en su origen (la posición y el giro los pone el contenedor). */
function FurnitureBody({ item }: { item: FurnitureItem }) {
  const w = item.w ?? 1;
  const d = item.d ?? 0.6;
  const h = item.h ?? 1;
  switch (item.kind) {
    case "conference-table":
    case "desk":
      // Tapa de madera con canto suave y patas finas de metal (también en las tipologías).
      return <ShapedTable shape={item.shape ?? rectShape(w, d)} />;
    case "chair":
      // Silla de oficina tapizada sobre cinco rayos (también en las tipologías).
      return <OfficeChair />;
    case "side-chair":
      return <DiningChair variant={item.variant ?? 0} />;
    case "credenza":
      return <Credenza width={w} x={0} z={0} />;
    case "whiteboard":
      return <Whiteboard width={w} height={h} x={0} y={0} z={0} />;
    case "lectern":
      return <Lectern x={0} z={0} />;
    case "sofa":
      if (item.shape) return <ShapedSofa shape={item.shape} backEdges={item.backEdges} color={item.color} />;
      // Sillón de tela moderno: respaldo atrás (−z), apoyabrazos y almohadones.
      return <ShapedSofa shape={rectShape(item.w ?? 1.8, SOFA_DEPTH)} backEdges={[0]} color={item.color} />;
    case "lounge-chair":
      if (item.shape) return <ShapedSofa shape={item.shape} backEdges={item.backEdges} color={item.color} />;
      return <ShapedSofa shape={rectShape(LOUNGE_SIZE, LOUNGE_SIZE)} backEdges={[0]} color={item.color ?? LOUNGE_FABRIC} />;
    case "coffee-table":
      return <ShapedTable shape={item.shape ?? rectShape(item.w ?? 1.1, item.d ?? 0.55)} low />;
    case "media-console":
      return <MediaConsole width={w} x={0} z={0} />;
    case "planter": {
      const size = item.fit && item.w && item.d ? Math.min(item.w, item.d) : 0.55 * (item.scale ?? 1);
      return <PottedPlant w={size} d={size} variant={item.variant ?? 0} />;
    }
    case "bed":
      return <Bed width={w} depth={d} />;
    case "nightstand":
      return <Nightstand x={0} z={0} />;
    case "wardrobe":
      // Placard de puertas lisas con tiradores negros (también en las tipologías).
      return <Wardrobe w={item.w ?? WARDROBE_W} d={item.d ?? WARDROBE_D} />;
    case "round-table":
      return <RoundTable radius={w / 2} color={item.color} />;
    case "bar-counter":
      return <BarCounter width={w} />;
    case "bar-stool":
      return <BarStool x={0} z={0} />;
    case "reception-desk":
      // Mostrador de cuarzo con frente de madera y luz LED bajo la tapa.
      return <ShapedCounter shape={item.shape ?? rectShape(w, d)} />;
    case "stage":
      return <Stage width={w} depth={d} height={item.h} />;
    case "backdrop":
      return (
        <mesh>
          <boxGeometry args={[w, h, 0.08]} />
          <meshStandardMaterial color="#0f172a" roughness={0.95} />
        </mesh>
      );
    case "rack":
      return <RackCabinet x={0} z={0} tall={item.tall} />;
    case "control-console":
      return <ControlConsole width={w} x={0} z={0} />;
    case "bench":
      return (
        <group>
          <mesh position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[0.45, 0.12, d]} />
            <meshStandardMaterial color={MAT.wood} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0.2, s * (d / 2 - 0.1)]}>
              <boxGeometry args={[0.4, 0.4, 0.08]} />
              <meshStandardMaterial color={MAT.metal} />
            </mesh>
          ))}
        </group>
      );
    case "umbrella":
      return (
        <group>
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 2.2, 8]} />
            <meshStandardMaterial color={MAT.metal} />
          </mesh>
          <mesh position={[0, 2.05, 0]}>
            <coneGeometry args={[1.1, 0.35, 16]} />
            <meshStandardMaterial color="#e7e5e4" roughness={0.9} />
          </mesh>
        </group>
      );
    case "av-panel":
      return (
        <mesh>
          <boxGeometry args={[w, h, 0.04]} />
          <meshStandardMaterial color={MAT.wallAccent} roughness={0.9} />
        </mesh>
      );
    case "video-wall":
      return (
        <group>
          <mesh>
            <boxGeometry args={[w, h, 0.08]} />
            <meshStandardMaterial color={MAT.black} />
          </mesh>
          {[-1.2, -0.4, 0.4, 1.2].map((ox) => (
            <group key={ox} position={[ox, 0, 0.05]}>
              <ScreenFace w={0.7} h={0.45} />
            </group>
          ))}
        </group>
      );
    case "signage-totem":
      return <SignageTotem />;
    case "acoustic-panel":
      return (
        <mesh castShadow>
          <boxGeometry args={[w, h, 0.06]} />
          <meshStandardMaterial color="#3a3f47" roughness={1} />
        </mesh>
      );
    case "pendant-lamp":
      return (
        <ModelOr
          url={MODELS.pendant}
          fit={{ width: 0.4 }}
          fallback={
            <mesh position={[0, 0.5, 0]}>
              <sphereGeometry args={[0.18, 24, 16]} />
              <meshStandardMaterial color="#fff4dc" emissive="#ffd9a0" emissiveIntensity={0.8} />
            </mesh>
          }
        />
      );
    case "shelving":
      return (
        <group>
          {[0.15, 0.6, 1.05, 1.5, 1.95].map((y) => (
            <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
              <boxGeometry args={[w, 0.03, 0.45]} />
              <meshStandardMaterial color={MAT.woodLight} roughness={0.7} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[(s * w) / 2, 1.05, 0]}>
              <boxGeometry args={[0.04, 2.1, 0.45]} />
              <meshStandardMaterial color={MAT.metalDark} />
            </mesh>
          ))}
        </group>
      );
    case "riser":
      return (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#2a2d33" roughness={0.95} />
        </mesh>
      );
    case "signage-panel":
      return (
        <group>
          <mesh>
            <boxGeometry args={[w, h, 0.06]} />
            <meshStandardMaterial color={MAT.metalDark} />
          </mesh>
          <ScreenFace w={w * 0.8} h={h * 0.82} z={0.04} />
        </group>
      );
    case "kitchen-counter":
      if (item.shape) return <ShapedCounter shape={item.shape} kitchen />;
      return <KitchenCounter width={w} depth={Math.max(0.5, Math.min(d, 1.2))} />;
    case "toilet":
      return <Toilet />;
    case "vanity":
      return <Vanity width={Math.max(0.45, w)} depth={Math.max(0.4, Math.min(d, 0.65))} />;
    case "shower":
      return <Shower width={Math.max(0.7, w)} depth={Math.max(0.7, d)} />;
    case "bathtub":
      return <Bathtub width={Math.max(1.2, w)} depth={Math.max(0.65, Math.min(d, 1))} />;
    case "rug":
      return <Rug shape={item.shape ?? rectShape(w, d)} variant={item.variant ?? 0} />;
    case "planter-box":
      return <PlanterBox shape={item.shape ?? rectShape(w, d)} variant={item.variant ?? 0} />;
    case "indoor-tree":
      return <PottedPlant w={w} d={d} variant={item.variant ?? 0} tree />;
    case "bench-seat":
      return <BenchSeat shape={item.shape ?? rectShape(w, Math.min(d, 0.5))} />;
    case "side-table":
      return <SideTable w={w} d={d} />;
    case "ottoman":
      return <Ottoman w={w} d={d} variant={item.variant ?? 0} />;
    case "wall-art":
      return <WallArt w={w} h={item.h ?? 0.8} variant={item.variant ?? 0} />;
    case "floor-lamp":
      return <FloorLamp />;
  }
  // Todos los tipos tienen dibujo: si se agrega uno nuevo sin caso, no compila.
  const unhandled: never = item.kind;
  return unhandled;
}

function SelectionMark({ item }: { item: FurnitureItem }) {
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry((item.w ?? 0.8) + 0.12, (item.mount === "wall" ? (item.h ?? 1) : (item.d ?? item.w ?? 0.8)) + 0.12);
    return new THREE.EdgesGeometry(plane);
  }, [item.w, item.h, item.d, item.mount]);
  return (
    <lineSegments geometry={geometry} rotation={item.mount === "wall" ? [0, 0, 0] : [-Math.PI / 2, 0, 0]} position={item.mount === "wall" ? [0, 0, 0.06] : [0, 0.02, 0]}>
      <lineBasicMaterial color={new THREE.Color(0.3, 0.7, 2.4)} toneMapped={false} />
    </lineSegments>
  );
}

function Toolbar({ canRotate, onRotate, onRemove, y }: { canRotate: boolean; onRotate: () => void; onRemove: () => void; y: number }): ReactNode {
  const btn = "flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100";
  return (
    <Html position={[0, y, 0]} center zIndexRange={[30, 0]}>
      <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-xl backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
        {canRotate ? (
          <button type="button" className={btn} onClick={onRotate} title="Girar 45°">
            <RotateCw className="h-3.5 w-3.5" /> Girar
          </button>
        ) : null}
        <button type="button" className={`${btn} hover:text-red-600`} onClick={onRemove} title="Quitar de la sala">
          <Trash2 className="h-3.5 w-3.5" /> Quitar
        </button>
      </div>
    </Html>
  );
}

function FurniturePiece({
  item,
  dims,
  selected,
  onSelect,
  onMove,
  onRemove,
}: {
  item: FurnitureItem;
  dims: RoomDims;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, z: number, rotY: number, y?: number) => void;
  onRemove: () => void;
}) {
  const [drag, setDrag] = useState<Pose | null>(null);
  const rotDeg = (item.rotY * 180) / Math.PI;
  const startDrag = useSurfaceDrag({
    mount: item.mount,
    dims,
    keepY: 0,
    keepRotation: rotDeg,
    onSelect,
    onMove: setDrag,
    onCommit: (p) => {
      setDrag(null);
      onMove(p.x, p.z, (p.rotY * Math.PI) / 180, item.mount === "wall" ? p.y : undefined);
    },
  });
  const x = drag?.x ?? item.x;
  const z = drag?.z ?? item.z;
  const y = drag && item.mount === "wall" ? drag.y : (item.y ?? 0);
  const rotY = drag ? (drag.rotY * Math.PI) / 180 : item.rotY;
  // Lo colgado en una pared se oculta junto con ella cuando la cámara queda del otro lado.
  const ref = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g || item.mount !== "wall") return;
    const behind = (camera.position.x - x) * Math.sin(rotY) + (camera.position.z - z) * Math.cos(rotY) < 0;
    if (g.visible === behind) g.visible = !behind;
  });

  return (
    <group
      ref={ref}
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        // Sin elegir, arrastrar sobre el mueble gira la cámara; elegido, lo mueve.
        if (selected) startDrag(e);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > CLICK_SLOP_PX) return;
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = selected ? "grab" : "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <group scale={fitScale(item)}>
        <FurnitureBody item={item} />
      </group>
      <FurnitureProps item={item} />
      {selected ? <SelectionMark item={item} /> : null}
      {selected && !drag ? (
        <Toolbar
          canRotate={item.mount === "floor"}
          y={item.mount === "wall" ? -((item.h ?? 1) / 2) - 0.2 : 1.25}
          onRotate={() => onMove(item.x, item.z, item.rotY + ROTATE_STEP, item.y)}
          onRemove={onRemove}
        />
      ) : null}
    </group>
  );
}

export function FurnitureLayer({
  items,
  overrides,
  dims,
  selectedId,
  onSelect,
  onChange,
}: {
  items: ResolvedFurniture[];
  overrides: FurnitureOverrides | null | undefined;
  dims: RoomDims;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange?: (next: FurnitureOverrides) => void;
}) {
  const base = overrides ?? {};
  return (
    <group>
      {items
        .filter((it) => !it.hiddenBy)
        .map((it) => (
          <FurniturePiece
            key={it.id}
            item={it}
            dims={dims}
            selected={selectedId === it.id}
            onSelect={() => onSelect(it.id)}
            onMove={(x, z, rotY, y) => onChange?.({ ...base, moved: { ...(base.moved ?? {}), [it.id]: { x, z, rotY, ...(y != null ? { y } : {}) } } })}
            onRemove={() => {
              onSelect(null);
              onChange?.({ ...base, removed: [...new Set([...(base.removed ?? []), it.id])] });
            }}
          />
        ))}
    </group>
  );
}

/* ── Objetos que vienen del plano: cocina y baño ── */

const PORCELAIN = "#f4f5f7";
const COUNTERTOP = "#d9d4cc";

function KitchenCounter({ width, depth }: { width: number; depth: number }) {
  return (
    <group>
      <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.86, depth - 0.04]} />
        <meshStandardMaterial color="#e7e2da" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.89, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.02, 0.04, depth]} />
        <meshStandardMaterial color={COUNTERTOP} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Toilet() {
  return (
    <group>
      <mesh position={[0, 0.2, 0.05]} castShadow>
        <cylinderGeometry args={[0.18, 0.15, 0.4, 24]} />
        <meshStandardMaterial color={PORCELAIN} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.42, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.19, 24]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.6, -0.2]} castShadow>
        <boxGeometry args={[0.4, 0.38, 0.17]} />
        <meshStandardMaterial color={PORCELAIN} roughness={0.25} />
      </mesh>
    </group>
  );
}

function Vanity({ width, depth }: { width: number; depth: number }) {
  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[width, 0.8, depth - 0.03]} />
        <meshStandardMaterial color="#8a6f57" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.84, 0]} castShadow>
        <boxGeometry args={[width + 0.02, 0.05, depth]} />
        <meshStandardMaterial color={COUNTERTOP} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.87, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[Math.min(width, depth) * 0.3, 24]} />
        <meshStandardMaterial color={PORCELAIN} roughness={0.2} />
      </mesh>
      {/* espejo en la pared */}
      <mesh position={[0, 1.45, -depth / 2 + 0.01]}>
        <boxGeometry args={[Math.min(width, 0.9), 0.7, 0.01]} />
        <meshStandardMaterial color="#cfd8e3" metalness={0.6} roughness={0.08} />
      </mesh>
    </group>
  );
}

function Shower({ width, depth }: { width: number; depth: number }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[width, 0.06, depth]} />
        <meshStandardMaterial color={PORCELAIN} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.0, depth / 2]}>
        <boxGeometry args={[width, 1.9, 0.01]} />
        <meshStandardMaterial color="#dbeafe" transparent opacity={0.25} roughness={0.05} />
      </mesh>
      <mesh position={[0, 2.0, -depth / 2 + 0.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.02, 20]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

function Bathtub({ width, depth }: { width: number; depth: number }) {
  return (
    <group>
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.56, depth]} />
        <meshStandardMaterial color={PORCELAIN} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.565, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width - 0.16, depth - 0.16]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.15} />
      </mesh>
    </group>
  );
}
