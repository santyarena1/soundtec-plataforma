"use client";

// Banco local (no se commitea): un ambiente evaluado (plan-eval.ts) con el plano en el piso y los muebles 3D encima.

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { FurnitureItem, ResolvedFurniture } from "@/services/room-builder/furnishing";
import type { PlanUnderlay as Underlay } from "@/services/room-builder/scene";
import { FurnitureLayer } from "@/components/room-builder/three/furniture-layer";
import { PlanUnderlay } from "@/components/room-builder/three/plan-underlay";
import { SceneLighting } from "@/components/room-builder/three/lighting";
import { SceneEffects } from "@/components/room-builder/three/effects";
import { SurfaceProvider, useLargeSurface } from "@/components/room-builder/three/surfaces";

type Room = { widthM: number; depthM: number; floor: Array<{ x: number; y: number }>; underlay: Underlay; furniture: FurnitureItem[] };
const H = 2.7;

function Walls({ floor, height }: { floor: Room["floor"]; height: number }) {
  const mat = useLargeSurface("plaster", "#f1efe9", 0.92, [6, 3]);
  return (
    <group>
      {floor.map((p, i) => {
        const q = floor[(i + 1) % floor.length]!;
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        const ang = Math.atan2(-(q.y - p.y), q.x - p.x);
        return (
          <mesh key={i} position={[(p.x + q.x) / 2, height / 2, (p.y + q.y) / 2]} rotation={[0, ang, 0]} material={mat} receiveShadow>
            <boxGeometry args={[len, height, 0.12]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Floor({ floor }: { floor: Room["floor"] }) {
  const mat = useLargeSurface("oak", "#ffffff", 0.6, [8, 8]);
  const geo = useMemo(() => {
    let c = floor.map((p) => new THREE.Vector2(p.x, -p.y));
    if (THREE.ShapeUtils.isClockWise(c)) c = [...c].reverse();
    const g = new THREE.ShapeGeometry(new THREE.Shape(c));
    const pos = g.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / 8;
      uv[i * 2 + 1] = pos.getY(i) / 8;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return g;
  }, [floor]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={geo} material={mat} receiveShadow />;
}

export default function PlanHarness() {
  const [room, setRoom] = useState<Room | null>(null);
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const scene = params.get("scene") ?? "syn-living";
  const index = Number(params.get("room") ?? 0);
  const view = params.get("view") ?? "top";
  const showPlan = params.get("plan") !== "0";
  useEffect(() => {
    fetch(`/dev-harness/${scene}.json`)
      .then((r) => r.json())
      .then((d: { rooms: Room[] }) => setRoom(d.rooms[index] ?? null));
  }, [scene, index]);
  if (!room) return <div id="loading">cargando</div>;
  const span = Math.max(room.widthM, room.depthM);
  const camera: [number, number, number] = view === "top" ? [0, span * 1.25, 0.01] : view === "eye" ? [room.widthM * 0.42, 1.6, room.depthM * 0.42] : [room.widthM * 0.55, span * 0.75, room.depthM * 0.75];
  return (
    <div style={{ width: "100vw", height: "100vh" }} id="ready">
      <Canvas shadows="soft" camera={{ position: camera, fov: 45, near: 0.05, far: 200 }} gl={{ antialias: true, preserveDrawingBuffer: true }} onCreated={({ gl }) => (gl.outputColorSpace = THREE.SRGBColorSpace)}>
        <SurfaceProvider enabled>
          <color attach="background" args={["#d9dee5"]} />
          <SceneLighting mood="warm" widthM={room.widthM} depthM={room.depthM} heightM={H} shadowMapSize={2048} />
          <Floor floor={room.floor} />
          {view !== "top" ? <Walls floor={room.floor} height={view === "eye" ? H : 0.9} /> : null}
          {showPlan ? (
            <Suspense fallback={null}>
              <PlanUnderlay underlay={room.underlay} floor={room.floor} widthM={room.widthM} depthM={room.depthM} />
            </Suspense>
          ) : null}
          <Suspense fallback={null}>
            <FurnitureLayer items={room.furniture as ResolvedFurniture[]} overrides={null} dims={{ widthM: room.widthM, depthM: room.depthM, heightM: H, floor: room.floor }} selectedId={null} onSelect={() => {}} />
          </Suspense>
          <OrbitControls makeDefault target={[0, view === "eye" ? 0.9 : 0, 0]} />
          {view === "top" ? null : <SceneEffects />}
        </SurfaceProvider>
      </Canvas>
    </div>
  );
}
