"use client";

/**
 * Arrastre sobre las superficies de la sala (paredes, techo, piso o una
 * altura fija), común a equipos y muebles. Un click sin moverse selecciona;
 * a partir de unos píxeles pasa a arrastre y la cámara se congela.
 */

import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { MountOption, Pose } from "@/services/room-builder/types";
import { surfaceHit, type RoomDims } from "@/services/room-builder/units";
import { dragState } from "./drag-state";

/** Píxeles de movimiento a partir de los cuales un click pasa a ser arrastre. */
const DRAG_THRESHOLD_PX = 4;

type ControlsLike = { enabled: boolean; cancel?: () => void };

export function useSurfaceDrag({
  mount,
  dims,
  keepY,
  keepRotation,
  onSelect,
  onMove,
  onCommit,
}: {
  mount: MountOption;
  dims: RoomDims;
  /** Altura a la que se arrastra en mesa/rack. */
  keepY: number;
  /** Conserva el giro (fuera de pared). */
  keepRotation: number;
  onSelect: () => void;
  onMove: (pose: Pose) => void;
  onCommit: (pose: Pose) => void;
}) {
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  const controls = useThree((st) => st.controls) as unknown as ControlsLike | null;
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  return (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect();
    const el = gl.domElement;
    const sx = e.nativeEvent.clientX;
    const sy = e.nativeEvent.clientY;
    let dragging = false;
    let last: Pose | null = null;

    const move = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        dragState.active = true;
        if (controls) {
          controls.cancel?.();
          controls.enabled = false;
        }
        el.style.cursor = "grabbing";
      }
      const rect = el.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1),
        camera,
      );
      const hit = surfaceHit(
        {
          origin: raycaster.ray.origin.toArray() as [number, number, number],
          dir: raycaster.ray.direction.toArray() as [number, number, number],
        },
        mount,
        dims,
        keepY,
      );
      if (!hit) return;
      last = mount === "wall" ? hit.pose : { ...hit.pose, rotY: keepRotation };
      onMove(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragState.active = false;
      if (controls) controls.enabled = true;
      el.style.cursor = "";
      if (dragging && last) onCommit(last);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
}
