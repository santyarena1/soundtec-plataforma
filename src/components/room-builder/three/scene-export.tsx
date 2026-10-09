"use client";

/**
 * Exporta la sala tal como se ve (muebles, equipos con sus fotos, paredes
 * visibles) a un .glb para la maqueta / AR. Deja afuera ayudas visuales:
 * halos de selección, conos de cobertura, contornos y luces.
 */

import { useThree } from "@react-three/fiber";
import { useEffect, type MutableRefObject } from "react";
import * as THREE from "three";

/** Modelo exportado + ángulo de la cámara del editor (para abrir la maqueta igual). */
export type ExportedRoom = { blob: Blob; cameraOrbit: string };
export type ExportRoomFn = () => Promise<ExportedRoom>;

/** Ángulo de cámara en formato model-viewer ("theta phi radio"). */
export function cameraOrbitFrom(position: { x: number; y: number; z: number }): string {
  const theta = (Math.atan2(position.x, position.z) * 180) / Math.PI;
  const len = Math.hypot(position.x, position.y, position.z) || 1;
  const phi = (Math.acos(Math.max(-1, Math.min(1, position.y / len))) * 180) / Math.PI;
  return `${theta.toFixed(1)}deg ${Math.max(20, Math.min(80, phi)).toFixed(1)}deg auto`;
}

/** Transparencias por debajo de esto son ayudas (anillos, conos), no objetos. */
const HELPER_OPACITY = 0.6;

function isHelper(o: THREE.Object3D): boolean {
  if (o.userData?.noExport) return true;
  if ((o as THREE.Light).isLight || (o as THREE.LineSegments).isLineSegments || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) return true;
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh) return false;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.some((m) => m && m.transparent && m.opacity < HELPER_OPACITY);
}

export function SceneExportBridge({ exportRef }: { exportRef: MutableRefObject<ExportRoomFn | null> }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    exportRef.current = async () => {
      const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
      const root = new THREE.Group();
      root.name = "Sala";
      for (const child of scene.children) {
        // Como se ve ahora: corte tipo casa de muñecas (paredes del lado de la cámara ocultas).
        if (!child.visible || isHelper(child)) continue;
        root.add(child.clone(true));
      }
      const drop: THREE.Object3D[] = [];
      root.traverse((o) => {
        if (o !== root && isHelper(o)) drop.push(o);
      });
      for (const o of drop) o.removeFromParent();
      const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
      return { blob: new Blob([result as ArrayBuffer], { type: "model/gltf-binary" }), cameraOrbit: cameraOrbitFrom(camera.position) };
    };
    return () => {
      exportRef.current = null;
    };
  }, [scene, camera, exportRef]);

  return null;
}
