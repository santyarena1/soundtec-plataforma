"use client";

// Banco local (no se commitea): muebles del plano con la luz y los efectos del visor real.

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import * as THREE from "three";
import type { FurnitureItem, ResolvedFurniture } from "@/services/room-builder/furnishing";
import { sofaBackEdges } from "@/services/room-builder/plan-shape";
import { FurnitureLayer } from "@/components/room-builder/three/furniture-layer";
import { RoomShell } from "@/components/room-builder/three/room-shell";
import { SceneLighting } from "@/components/room-builder/three/lighting";
import { SceneEffects } from "@/components/room-builder/three/effects";
import { SurfaceProvider } from "@/components/room-builder/three/surfaces";

const W = 10;
const D = 8;
const H = 3;

const L = [
  { x: -1.4, y: -1.3 },
  { x: -0.5, y: -1.3 },
  { x: -0.5, y: 0.4 },
  { x: 1.4, y: 0.4 },
  { x: 1.4, y: 1.3 },
  { x: -1.4, y: 1.3 },
];
const sofaL = (): FurnitureItem => ({ id: "l", kind: "sofa", group: "S", x: -3.2, z: 1.8, rotY: 0, mount: "floor", w: 2.8, d: 2.6, fit: true, shape: L, backEdges: sofaBackEdges(L, { x: 1, y: -1 }), variant: 0 });
const rect = (w: number, d: number) => [
  { x: -w / 2, y: -d / 2 },
  { x: w / 2, y: -d / 2 },
  { x: w / 2, y: d / 2 },
  { x: -w / 2, y: d / 2 },
];
const trap = [
  { x: -1.6, y: -0.35 },
  { x: 1.6, y: -0.35 },
  { x: 1.2, y: 0.35 },
  { x: -1.2, y: 0.35 },
];
const ITEMS: FurnitureItem[] = [
  sofaL(),
  { id: "s2", kind: "sofa", group: "S", x: 0.4, z: 3.2, rotY: 0, mount: "floor", w: 2.2, d: 0.9, fit: true, shape: rect(2.2, 0.9), backEdges: sofaBackEdges(rect(2.2, 0.9), { x: 0, y: -1 }), variant: 1 },
  { id: "rug", kind: "rug", group: "A", x: -2.2, z: 1.2, rotY: 0, mount: "floor", w: 2.6, d: 2, fit: true, shape: rect(2.6, 2), variant: 0 },
  { id: "ct", kind: "coffee-table", group: "M", x: -2.2, z: 1.2, rotY: 0, mount: "floor", w: 1.1, d: 0.6, fit: true },
  { id: "desk", kind: "reception-desk", group: "M", x: 2, z: -2.6, rotY: 0, mount: "floor", w: 3.2, d: 0.7, fit: true, shape: trap },
  { id: "p1", kind: "planter", group: "P", x: -4.4, z: -3.4, rotY: 0, mount: "floor", w: 0.5, d: 0.5, fit: true, variant: 0 },
  { id: "p2", kind: "planter", group: "P", x: -3.5, z: -3.4, rotY: 0, mount: "floor", w: 0.4, d: 0.4, fit: true, variant: 1 },
  { id: "p3", kind: "planter", group: "P", x: -2.6, z: -3.4, rotY: 0, mount: "floor", w: 0.6, d: 0.6, fit: true, variant: 2 },
  { id: "p4", kind: "planter", group: "P", x: -1.6, z: -3.4, rotY: 0, mount: "floor", w: 0.45, d: 0.45, fit: true, variant: 3 },
  { id: "tree", kind: "indoor-tree", group: "P", x: 4.2, z: 3.2, rotY: 0, mount: "floor", w: 0.9, d: 0.9, fit: true, variant: 0 },
  { id: "pb", kind: "planter-box", group: "P", x: 2.6, z: 0.6, rotY: 0, mount: "floor", w: 2, d: 0.4, fit: true, shape: rect(2, 0.4), variant: 0 },
  { id: "ot", kind: "ottoman", group: "S", x: -0.6, z: 1.6, rotY: 0, mount: "floor", w: 0.55, d: 0.55, fit: true, variant: 2 },
  { id: "bn", kind: "bench-seat", group: "B", x: 4.2, z: -0.8, rotY: Math.PI / 2, mount: "floor", w: 1.6, d: 0.45, fit: true },
  { id: "st", kind: "side-table", group: "M", x: -0.4, z: 3.2, rotY: 0, mount: "floor", w: 0.45, d: 0.45, fit: true },
  { id: "kc", kind: "kitchen-counter", group: "K", x: 3.6, z: -3.65, rotY: 0, mount: "floor", w: 2.4, d: 0.6, fit: true, shape: rect(2.4, 0.6) },
];

const VIEWS: Array<[number, number, number, number, number, number]> = [
  [6, 5.5, 7.5, 0, 0.4, 0],
  [-0.6, 1.5, -0.8, -3.4, 0.5, 2.2],
  [2, 1.7, 0.5, 2, 0.8, -2.6],
  [-3, 1.5, -1.2, -3, 0.5, -3.4],
  [3.2, 1.6, -1.2, 3.6, 0.8, 2.5],
];

export default function RenderHarness() {
  const view = useMemo(() => {
    if (typeof window === "undefined") return VIEWS[0]!;
    const v = Number(new URLSearchParams(window.location.search).get("view") ?? 0);
    return VIEWS[v] ?? VIEWS[0]!;
  }, []);
  const items = ITEMS as ResolvedFurniture[];
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas
        shadows="soft"
        camera={{ position: [view[0], view[1], view[2]], fov: 45, near: 0.05, far: 200 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <SurfaceProvider enabled>
          <color attach="background" args={["#c9d1db"]} />
          <SceneLighting mood="office" widthM={W} depthM={D} heightM={H} shadowMapSize={2048} />
          <RoomShell widthM={W} depthM={D} heightM={H} plan={undefined} category="common" templateKey="lobby" />
          <Suspense fallback={null}>
            <FurnitureLayer items={items} overrides={null} dims={{ widthM: W, depthM: D, heightM: H, floor: null }} selectedId={null} onSelect={() => {}} />
          </Suspense>
          <OrbitControls makeDefault target={[view[3], view[4], view[5]]} />
          <SceneEffects />
        </SurfaceProvider>
      </Canvas>
    </div>
  );
}
