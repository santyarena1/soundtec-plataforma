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
import { dragState } from "./drag-state";

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

const IDLE_SECONDS = 6;
/** Velocidad del giro automático (rad/s): arranca y frena suave. */
const TOUR_SPEED = 0.06;
const TOUR_EASE = 0.8;
/** Giro con Q / E (radianes). */
const KEY_TURN = Math.PI / 12;

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
  const tourSpeed = useRef(0);
  const gl = useThree((st) => st.gl);
  // Solo las vistas centradas en un equipo se mueven al elegir otro equipo.
  const framingKey = preset === "detail" || preset === "device_pov" ? (selected?.slotKey ?? "") : "";

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
  }, [preset, widthM, depthM, heightM, framingKey]);

  // Interacción del usuario: corta el recorrido automático.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const start = () => {
      interacting.current = true;
      idleFor.current = 0;
      tourSpeed.current = 0;
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

  // Moverse con el teclado: W A S D / flechas, Q E para girar, + − para acercar.
  useEffect(() => {
    const step = () => Math.max(0.35, Math.hypot(widthM, depthM) * 0.06);
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true]") || e.ctrlKey || e.metaKey || e.altKey) return;
      const c = ref.current;
      if (!c) return;
      const k = e.key.toLowerCase();
      const moves: Record<string, () => void> = {
        w: () => void c.forward(step(), true),
        arrowup: () => void c.forward(step(), true),
        s: () => void c.forward(-step(), true),
        arrowdown: () => void c.forward(-step(), true),
        a: () => void c.truck(-step(), 0, true),
        arrowleft: () => void c.truck(-step(), 0, true),
        d: () => void c.truck(step(), 0, true),
        arrowright: () => void c.truck(step(), 0, true),
        q: () => void c.rotate(KEY_TURN, 0, true),
        e: () => void c.rotate(-KEY_TURN, 0, true),
        "+": () => void c.dolly(step(), true),
        "=": () => void c.dolly(step(), true),
        "-": () => void c.dolly(-step(), true),
      };
      const move = moves[k];
      if (!move) return;
      e.preventDefault();
      idleFor.current = 0;
      tourSpeed.current = 0;
      move();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [widthM, depthM]);

  // Doble clic en el piso: la cámara va a mirar ese punto.
  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const onDbl = (e: MouseEvent) => {
      const c = ref.current;
      if (!c) return;
      const rect = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
      if (!ray.ray.intersectPlane(floor, hit)) return;
      if (Math.abs(hit.x) > widthM / 2 + 0.5 || Math.abs(hit.z) > depthM / 2 + 0.5) return;
      idleFor.current = 0;
      tourSpeed.current = 0;
      void c.moveTo(hit.x, Math.min(heightM * 0.4, 1.1), hit.z, true);
    };
    el.addEventListener("dblclick", onDbl);
    return () => el.removeEventListener("dblclick", onDbl);
  }, [gl, camera, widthM, depthM, heightM]);

  useFrame((_, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    // El FOV también viaja suave.
    if (Math.abs(cam.fov - fovTarget.current) > 0.05) {
      cam.fov = THREE.MathUtils.damp(cam.fov, fovTarget.current, 4, delta);
      cam.updateProjectionMatrix();
    }
    const c = ref.current;
    if (dragState.active) idleFor.current = 0;
    if (!c) return;
    const touring = autoTour && !interacting.current && !dragState.active;
    if (touring) idleFor.current += delta;
    // Giro lento solo en vistas "de afuera" (no en las de ojo o equipo), que acelera y frena suave.
    const want = touring && idleFor.current > IDLE_SECONDS && (preset === "general" || preset === "cinema") ? TOUR_SPEED : 0;
    tourSpeed.current = THREE.MathUtils.damp(tourSpeed.current, want, want ? TOUR_EASE : TOUR_EASE * 4, delta);
    if (tourSpeed.current > 0.0005) void c.rotate(delta * tourSpeed.current, 0, false);
  });

  return <CameraControls ref={ref} makeDefault />;
}
