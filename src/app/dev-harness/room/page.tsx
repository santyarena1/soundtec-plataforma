"use client";

// Banco local (no se commitea): una tipología completa (sala, muebles, ambientación) con la luz y los efectos del visor.
// ?t=<tipología>&cam=0 (vista general) | 1 (a la altura de los ojos)

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { resolveSceneFurniture } from "@/services/room-builder/furnishing";
import { buildSceneFromTemplate } from "@/services/room-builder/scene";
import { listRoomTemplates } from "@/services/room-builder/templates";
import { FurnitureLayer } from "@/components/room-builder/three/furniture-layer";
import { RoomShell } from "@/components/room-builder/three/room-shell";
import { SceneLighting, moodFor } from "@/components/room-builder/three/lighting";
import { SceneEffects } from "@/components/room-builder/three/effects";
import { SurfaceProvider } from "@/components/room-builder/three/surfaces";

export default function RoomHarness() {
  const { t, cam } = useMemo(() => {
    const q = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
    return { t: q.get("t") ?? "residential-living-m", cam: Number(q.get("cam") ?? 0) };
  }, []);
  const template = listRoomTemplates().find((x) => x.key === t) ?? listRoomTemplates()[0]!;
  const scene = useMemo(() => buildSceneFromTemplate(template), [template]);
  const items = useMemo(() => resolveSceneFurniture(scene, template.category), [scene, template.category]);
  const W = scene.widthM;
  const D = scene.depthM;
  const H = scene.heightM;
  const view: [number, number, number, number, number, number] =
    cam === 1 ? [W * 0.38, 1.6, -D * 0.4, -W * 0.1, 0.9, D * 0.2] : [W * 0.55, Math.max(W, D) * 0.75, D * 0.85, 0, 0.3, 0];
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas
        shadows="soft"
        camera={{ position: [view[0], view[1], view[2]], fov: 50, near: 0.05, far: 200 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          // Igual que el visor en calidad alta: el tono lo pone el efecto.
          gl.toneMapping = THREE.NoToneMapping;
        }}
      >
        <SurfaceProvider enabled>
          <color attach="background" args={["#d9dde2"]} />
          <SceneLighting mood={moodFor(template.category, template.key)} widthM={W} depthM={D} heightM={H} shadowMapSize={2048} />
          <RoomShell widthM={W} depthM={D} heightM={H} plan={undefined} category={template.category} templateKey={template.key} />
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
