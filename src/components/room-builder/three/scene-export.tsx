"use client";

/**
 * Exporta la sala tal como se ve (muebles, equipos con sus fotos, paredes
 * visibles) a un .glb para la maqueta / AR. Deja afuera ayudas visuales:
 * halos de selección, conos de cobertura, contornos y luces.
 */

import { useThree } from "@react-three/fiber";
import { useEffect, type MutableRefObject } from "react";
import * as THREE from "three";

export type ExportRoomFn = () => Promise<Blob>;

/** Transparencias por debajo de esto son ayudas (anillos, conos), no objetos. */
const HELPER_OPACITY = 0.6;

function isHelper(o: THREE.Object3D): boolean {
  if ((o as THREE.Light).isLight || (o as THREE.LineSegments).isLineSegments || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) return true;
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh) return false;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.some((m) => m && m.transparent && m.opacity < HELPER_OPACITY);
}

export function SceneExportBridge({ exportRef }: { exportRef: MutableRefObject<ExportRoomFn | null> }) {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    exportRef.current = async () => {
      const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
      const root = new THREE.Group();
      root.name = "Sala";
      for (const child of scene.children) {
        if (!child.visible || isHelper(child)) continue;
        root.add(child.clone(true));
      }
      const drop: THREE.Object3D[] = [];
      root.traverse((o) => {
        if (o !== root && isHelper(o)) drop.push(o);
      });
      for (const o of drop) o.removeFromParent();
      const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
      return new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
    };
    return () => {
      exportRef.current = null;
    };
  }, [scene, exportRef]);

  return null;
}
