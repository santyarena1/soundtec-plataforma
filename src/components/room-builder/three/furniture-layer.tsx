"use client";

/**
 * Muebles y objetos de la sala, editables: tocás uno para elegirlo y después
 * lo arrastrás, lo girás o lo quitás. Los que tapa una pantalla (pizarrón
 * detrás de una TV) no se dibujan.
 */

import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo, useState, type ReactNode } from "react";
import * as THREE from "three";
import { RotateCw, Trash2 } from "lucide-react";
import type { FurnitureItem, FurnitureOverrides, ResolvedFurniture } from "@/services/room-builder/furnishing";
import type { Pose } from "@/services/room-builder/types";
import type { RoomDims } from "@/services/room-builder/units";
import {
  BarCounter,
  BarStool,
  Bed,
  Chair,
  CoffeeTable,
  ControlConsole,
  Credenza,
  DeskTable,
  Lectern,
  LoungeChair,
  MAT,
  MediaConsole,
  Nightstand,
  Planter,
  RackCabinet,
  ReceptionDesk,
  RoundTable,
  SideChair,
  Sofa,
  Stage,
  Whiteboard,
} from "../scene-primitives";
import { MODELS, ModelOr } from "./models";
import { useSurfaceDrag } from "./use-surface-drag";

const ROTATE_STEP = Math.PI / 4;
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

/** Dibujo de cada tipo, en su origen (la posición y el giro los pone el contenedor). */
function FurnitureBody({ item }: { item: FurnitureItem }) {
  const w = item.w ?? 1;
  const d = item.d ?? 0.6;
  const h = item.h ?? 1;
  switch (item.kind) {
    case "conference-table":
    case "desk":
      return <DeskTable width={w} depth={d} color={item.color} />;
    case "chair":
      return <Chair x={0} z={0} color={item.color} />;
    case "side-chair":
      return <SideChair x={0} z={0} color={item.color} />;
    case "credenza":
      return <Credenza width={w} x={0} z={0} />;
    case "whiteboard":
      return <Whiteboard width={w} height={h} x={0} y={0} z={0} />;
    case "lectern":
      return <Lectern x={0} z={0} />;
    case "sofa":
      return <Sofa width={w} x={0} z={0} color={item.color} />;
    case "lounge-chair":
      return <LoungeChair x={0} z={0} />;
    case "coffee-table":
      return <CoffeeTable x={0} z={0} w={item.w} d={item.d} />;
    case "media-console":
      return <MediaConsole width={w} x={0} z={0} />;
    case "planter":
      return <Planter x={0} z={0} scale={item.scale} />;
    case "bed":
      return <Bed width={w} depth={d} />;
    case "nightstand":
      return <Nightstand x={0} z={0} />;
    case "wardrobe":
      return (
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[0.55, 2.2, 0.7]} />
          <meshStandardMaterial color={MAT.wood} roughness={0.85} />
        </mesh>
      );
    case "round-table":
      return <RoundTable radius={w / 2} color={item.color} />;
    case "bar-counter":
      return <BarCounter width={w} />;
    case "bar-stool":
      return <BarStool x={0} z={0} />;
    case "reception-desk":
      return <ReceptionDesk width={w} depth={d} />;
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
      return (
        <group>
          <mesh position={[0, 1.2, 0]}>
            <boxGeometry args={[0.35, 2.4, 0.2]} />
            <meshStandardMaterial color={MAT.metalDark} />
          </mesh>
          <group position={[0, 1.5, 0.11]}>
            <ScreenFace w={0.3} h={1.2} />
          </group>
        </group>
      );
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

  return (
    <group
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
      <FurnitureBody item={item} />
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
