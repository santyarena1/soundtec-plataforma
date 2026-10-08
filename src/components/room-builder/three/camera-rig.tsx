"use client";

/**
 * Cámara del Room Builder: libre (girar, acercar, desplazar) con límites para
 * que nunca atraviese el piso ni se aleje de la sala, viajes suaves entre las
 * vistas y, si nadie la toca un rato, un giro lento tipo showroom.
 */

import { CameraControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type CameraControlsImpl from "camera-controls";
import type { CameraPreset } from "@/services/room-builder/types";
import type { SceneDevice } from "@/services/room-builder/scene";

export interface Framing {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/** Encuadres de cada vista. La sala va de -w/2..w/2 (x), 0..h (y), -d/2..d/2 (z); la pared AV es +z. */
export function framingFor(preset: CameraPreset, w: number, d: number, h: number, selected: SceneDevice | null): Framing {
  const diag = Math.hypot(w, d);
  switch (preset) {
    case "plan":
      return { position: [0, Math.max(h * 2.4, diag * 1.15), 0.001], target: [0, 0, 0], fov: 45 };
    case "eye":
      // Desde el fondo de la sala, a la altura de los ojos de alguien sentado/parado.
      return { position: [w * 0.12, 1.45, -d / 2 + 0.6], target: [0, 1.25, d / 2], fov: 60 };
    case "cinema":
      return { position: [-w * 0.38, h * 0.62, -d * 0.4], target: [w * 0.05, h * 0.42, d * 0.25], fov: 38 };
    case "front_av":
      return { position: [0, Math.min(h * 0.7, 1.9), d * 0.05], target: [0, h * 0.5, d / 2], fov: 50 };
    case "detail":
    case "device_pov": {
      if (selected) {
        const { x, y, z, rotY } = selected.pose;
        const a = (rotY * Math.PI) / 180;
        // Delante del equipo (su frente mira hacia +z rotado), un poco de costado.
        const dist = preset === "detail" ? 1.4 : 0.5;
        const fx = Math.sin(a) * dist + Math.cos(a) * dist * 0.45;
        const fz = Math.cos(a) * dist - Math.sin(a) * dist * 0.45;
        const target: [number, number, number] = [x, y, z];
        const position: [number, number, number] =
          preset === "detail"
            ? [x + fx, Math.max(0.6, Math.min(h - 0.2, y + 0.25)), z + fz]
            : [x + Math.sin(a) * 0.15, y, z + Math.cos(a) * 0.15];
        if (preset === "device_pov") {
          return { position, target: [x + Math.sin(a) * 3, y - 0.2, z + Math.cos(a) * 3], fov: 62 };
        }
        return { position, target, fov: 40 };
      }
      return { position: [w * 0.3, h * 0.75, d * 0.1], target: [0, h * 0.45, d * 0.4], fov: 45 };
    }
    case "general":
    default:
      // Vista de maqueta: desde afuera y arriba; las paredes del lado de la cámara se ocultan solas.
      return {
        position: [w * 0.85 + 1.2, h + diag * 0.55, -d * 0.95 - 1.2],
        target: [0, h * 0.25, d * 0.08],
        fov: 40,
      };
  }
}

const IDLE_SECONDS = 9;

export function CameraRig({
  preset,
  widthM,
  depthM,
  heightM,
  selected,
  autoTour,
}: {
  preset: CameraPreset;
  widthM: number;
  depthM: number;
  heightM: number;
  selected: SceneDevice | null;
  autoTour: boolean;
}) {
  const ref = useRef<CameraControlsImpl>(null);
  const { camera } = useThree();
  const idleFor = useRef(0);
  const interacting = useRef(false);
  const fovTarget = useRef<number>((camera as THREE.PerspectiveCamera).fov);
  const selectedKey = selected?.slotKey ?? "";

  // Límites: nunca bajo el piso, distancia acotada al tamaño de la sala.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const diag = Math.hypot(widthM, depthM, heightM);
    c.minDistance = 0.25;
    c.maxDistance = diag * 2.2;
    c.minPolarAngle = 0.05;
    c.maxPolarAngle = preset === "plan" ? 0.25 : Math.PI * 0.49;
    c.smoothTime = 0.55;
    c.draggingSmoothTime = 0.12;
    c.dollyToCursor = true;
    c.dollySpeed = 0.6;
    c.truckSpeed = 1.2;
    const margin = Math.max(widthM, depthM) * 0.9 + 3;
    c.setBoundary(
      new THREE.Box3(
        new THREE.Vector3(-widthM / 2 - margin, 0.15, -depthM / 2 - margin),
        new THREE.Vector3(widthM / 2 + margin, heightM + diag * 2, depthM / 2 + margin),
      ),
    );
    c.boundaryEnclosesCamera = true;
  }, [widthM, depthM, heightM, preset]);

  // Viaje suave a la vista elegida.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const f = framingFor(preset, widthM, depthM, heightM, selected);
    fovTarget.current = f.fov;
    idleFor.current = 0;
    void c.setLookAt(...f.position, ...f.target, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, widthM, depthM, heightM, selectedKey]);

  // Interacción del usuario: corta el recorrido automático.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const start = () => {
      interacting.current = true;
      idleFor.current = 0;
    };
    const end = () => {
      interacting.current = false;
      idleFor.current = 0;
    };
    c.addEventListener("controlstart", start);
    c.addEventListener("controlend", end);
    return () => {
      c.removeEventListener("controlstart", start);
      c.removeEventListener("controlend", end);
    };
  }, []);

  useFrame((_, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    // El FOV también viaja suave.
    if (Math.abs(cam.fov - fovTarget.current) > 0.05) {
      cam.fov = THREE.MathUtils.damp(cam.fov, fovTarget.current, 4, delta);
      cam.updateProjectionMatrix();
    }
    const c = ref.current;
    if (!c || !autoTour || interacting.current) return;
    idleFor.current += delta;
    // Giro lento solo en vistas "de afuera" (no en las de ojo o equipo).
    if (idleFor.current > IDLE_SECONDS && (preset === "general" || preset === "cinema")) {
      void c.rotate(delta * 0.045, 0, false);
    }
  });

  return <CameraControls ref={ref} makeDefault />;
}
