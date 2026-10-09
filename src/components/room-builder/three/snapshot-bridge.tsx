"use client";

/**
 * Captura de la vista 3D actual (para la propuesta en PDF): renderiza un
 * cuadro y lo devuelve como JPEG.
 */

import { useThree } from "@react-three/fiber";
import { useEffect, type MutableRefObject } from "react";

export type SnapshotFn = () => string | null;

export function SnapshotBridge({ snapshotRef }: { snapshotRef: MutableRefObject<SnapshotFn | null> }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    snapshotRef.current = () => {
      try {
        gl.render(scene, camera);
        return gl.domElement.toDataURL("image/jpeg", 0.86);
      } catch {
        return null;
      }
    };
    return () => {
      snapshotRef.current = null;
    };
  }, [gl, scene, camera, snapshotRef]);
  return null;
}
