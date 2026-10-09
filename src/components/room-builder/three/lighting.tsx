"use client";

/**
 * Iluminación tipo render de arquitectura, sin depender de servidores externos:
 * - Ambiente generado en la propia escena (paneles de luz de techo + ventana)
 *   para reflejos y luz rebotada realistas.
 * - Luz principal suave con sombras (entra "por la ventana").
 * - Si hay un HDRI propio en /public, se usa para los reflejos.
 * Cada tipología tiene su temperatura de luz.
 */

import { Environment, Lightformer } from "@react-three/drei";
import { Suspense } from "react";

export type LightMood = "office" | "warm" | "evening" | "outdoor" | "dark";

export function moodFor(category: string, templateKey: string): LightMood {
  if (templateKey === "hotel-pool-bar-m" || templateKey === "residential-outdoor-m") return "outdoor";
  if (templateKey === "residential-cinema-m") return "dark";
  if (templateKey === "restaurant-m") return "evening";
  if (category === "commercial" || category === "office" || category === "common") return "office";
  if (category === "residential" || category === "hotel") return "warm";
  if (category === "event" || category === "control-room") return "dark";
  if (category === "lobby") return "evening";
  return "office";
}

const MOODS: Record<LightMood, { key: string; keyIntensity: number; fill: string; ambient: number; panel: string; window: string; env: number }> = {
  office: { key: "#fff6ea", keyIntensity: 2.2, fill: "#dbe7ff", ambient: 0.18, panel: "#ffffff", window: "#e8f1ff", env: 0.9 },
  warm: { key: "#fff0dc", keyIntensity: 2.2, fill: "#f4f1ec", ambient: 0.16, panel: "#fff6ea", window: "#fff8ee", env: 0.75 },
  evening: { key: "#ffd9a8", keyIntensity: 1.8, fill: "#c9d6ff", ambient: 0.14, panel: "#ffe6c4", window: "#9fb6ff", env: 0.8 },
  outdoor: { key: "#fff4dc", keyIntensity: 3, fill: "#cfe3ff", ambient: 0.25, panel: "#ffffff", window: "#ffffff", env: 1 },
  dark: { key: "#e6ecff", keyIntensity: 1.2, fill: "#8fa6ff", ambient: 0.08, panel: "#dfe8ff", window: "#5a6fa8", env: 0.55 },
};

/** HDRI propio (Poly Haven, CC0) para reflejos y luz rebotada; "dark" usa el ambiente generado. */
const HDRI_BY_MOOD: Partial<Record<LightMood, string>> = {
  office: "/room-builder/hdri/interior-office-bright.hdr",
  warm: "/room-builder/hdri/interior-warm-living.hdr",
  evening: "/room-builder/hdri/interior-warm-living.hdr",
  outdoor: "/room-builder/hdri/interior-office-bright.hdr",
};

export function SceneLighting({
  mood,
  widthM,
  depthM,
  heightM,
  shadowMapSize,
}: {
  mood: LightMood;
  widthM: number;
  depthM: number;
  heightM: number;
  shadowMapSize: number;
}) {
  const m = MOODS[mood];
  const span = Math.max(widthM, depthM) * 0.75 + 1;
  const hdri = HDRI_BY_MOOD[mood];

  return (
    <>
      {/* Ambiente para reflejos y luz rebotada */}
      <Suspense fallback={null}>
        <Environment resolution={256} frames={1} environmentIntensity={m.env} files={hdri}>
          {!hdri ? (
            <>
              <color attach="background" args={["#1b1f26"]} />
              {/* paneles de techo */}
              {[-1, 0, 1].map((i) => (
                <Lightformer key={i} form="rect" intensity={2.2} color={m.panel} position={[i * 3, 6, 0]} rotation-x={Math.PI / 2} scale={[2.4, 6, 1]} />
              ))}
              {/* ventanales a los lados */}
              <Lightformer form="rect" intensity={3} color={m.window} position={[-8, 2, 0]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
              <Lightformer form="rect" intensity={1.6} color={m.window} position={[8, 2, 0]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
              {/* rebote cálido del piso */}
              <Lightformer form="rect" intensity={0.6} color="#d6c2a8" position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} />
            </>
          ) : null}
        </Environment>
      </Suspense>

      <ambientLight intensity={m.ambient} color={m.fill} />
      <hemisphereLight args={[m.fill, "#6b5f52", 0.35]} />
      {/* Luz principal: entra desde el lado de la ventana, sombras suaves */}
      <directionalLight
        castShadow
        color={m.key}
        intensity={m.keyIntensity}
        position={[-widthM * 0.9 - 3, heightM + 4, -depthM * 0.3]}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-bias={-0.00025}
        shadow-normalBias={0.02}
        shadow-radius={6}
      />
      {/* Relleno suave del otro lado */}
      <directionalLight color={m.fill} intensity={0.35} position={[widthM + 2, heightM * 0.8, depthM]} />
    </>
  );
}
