"use client";

/**
 * Muebles con modelo 3D real (Poly Haven, CC0; ver public/room-builder/manifest.json).
 * Mientras el modelo carga, o si falla, se muestra el mueble armado por código
 * (mismo lugar y tamaño), así la sala nunca queda vacía.
 */

import { useGLTF } from "@react-three/drei";
import { Component, Suspense, useMemo, type ReactNode } from "react";
import * as THREE from "three";

export const MODELS = {
  sofa: "/room-builder/models/sofa-chesterfield-leather.glb",
  loungeChair: "/room-builder/models/armchair-midcentury-lounge.glb",
  armchair: "/room-builder/models/armchair-modern-leather.glb",
  diningChair: "/room-builder/models/chair-dining-modern.glb",
  coffeeTableStone: "/room-builder/models/coffeetable-modern-stone.glb",
  coffeeTableRound: "/room-builder/models/coffeetable-round-marble.glb",
  sideTable: "/room-builder/models/sidetable-modern-wood.glb",
  tableRound: "/room-builder/models/table-round-wood.glb",
  plantTall: "/room-builder/models/plant-tall-floor.glb",
  plantMedium: "/room-builder/models/plant-medium-floor.glb",
  plantSmall: "/room-builder/models/plant-small-succulent.glb",
  pendant: "/room-builder/models/lamp-pendant-globe.glb",
  sideboard: "/room-builder/models/sideboard-modern-wood.glb",
  barStool: "/room-builder/models/barstool-wood-round.glb",
  vase: "/room-builder/models/decor-vase-ceramic.glb",
  treePachiraTall: "/room-builder/models/tree-pachira-tall.glb",
  treePachiraMedium: "/room-builder/models/tree-pachira-medium.glb",
  plantFern: "/room-builder/models/plant-fern.glb",
  plantCalathea: "/room-builder/models/plant-calathea.glb",
  plantAnthurium: "/room-builder/models/plant-anthurium.glb",
} as const;

/**
 * Tamaño buscado (m). Solo ancho: escala uniforme. Ancho + profundidad: escala
 * x/z exacta y el alto acompaña suave (sin deformar de más).
 */
export interface FitSpec {
  width: number;
  depth?: number;
}

function scaleFor(fit: FitSpec, s: THREE.Vector3): [number, number, number] {
  const kx = fit.width / s.x;
  if (!fit.depth) return [kx, kx, kx];
  const kz = fit.depth / s.z;
  const ky = Math.min(1.15, Math.max(0.85, (kx + kz) / 2));
  return [kx, ky, kz];
}

class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {}
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Fitted({ url, width, depth, rotationY = 0 }: { url: string; width: number; depth?: number; rotationY?: number }) {
  const { scene } = useGLTF(url, false, true);
  const { object, scale } = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
    return { object: clone, scale: scaleFor({ width, depth }, size) };
  }, [scene, width, depth]);
  return (
    <group rotation={[0, rotationY, 0]} scale={scale}>
      <primitive object={object} />
    </group>
  );
}

/** Modelo real con su mueble de respaldo (el mismo lugar y tamaño). */
export function ModelOr({
  url,
  fit,
  rotationY,
  at,
  fallback,
}: {
  url: string;
  fit: FitSpec;
  /** Giro extra del modelo (ej. mesa con el lado largo en z). */
  rotationY?: number;
  /** Dónde va el modelo (el mueble de respaldo ya trae su propia ubicación). */
  at?: { x: number; z: number; rotY?: number; y?: number };
  fallback: ReactNode;
}) {
  const model = <Fitted url={url} width={fit.width} depth={fit.depth} rotationY={rotationY} />;
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        {at ? (
          <group position={[at.x, at.y ?? 0, at.z]} rotation={[0, at.rotY ?? 0, 0]}>
            {model}
          </group>
        ) : (
          model
        )}
      </Suspense>
    </ModelBoundary>
  );
}
