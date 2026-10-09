"use client";

/**
 * El plano original impreso en el piso de la sala, alineado con sus paredes:
 * se ven los muebles, sanitarios y puertas dibujados, con los equipos 3D
 * encima (como la vista de planta de los configuradores profesionales).
 */

import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { PlanUnderlay as Underlay } from "@/services/room-builder/scene";

/** Apenas sobre el piso para que no titile con él. */
const LIFT_M = 0.004;

export function PlanUnderlay({
  underlay,
  floor,
  widthM,
  depthM,
}: {
  underlay: Underlay;
  /** Forma real del piso en metros (x, y = z); sin ella, el rectángulo de la sala. */
  floor: Array<{ x: number; y: number }> | null;
  widthM: number;
  depthM: number;
}) {
  const texture = useTexture(underlay.imageUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const geometry = useMemo(() => {
    const pts =
      floor && floor.length >= 3
        ? floor
        : [
            { x: -widthM / 2, y: -depthM / 2 },
            { x: widthM / 2, y: -depthM / 2 },
            { x: widthM / 2, y: depthM / 2 },
            { x: -widthM / 2, y: depthM / 2 },
          ];
    // La figura se arma en XY con y = -z y se acuesta (rotación -90° en X).
    let contour = pts.map((p) => new THREE.Vector2(p.x, -p.y));
    if (THREE.ShapeUtils.isClockWise(contour)) contour = [...contour].reverse();
    const geo = new THREE.ShapeGeometry(new THREE.Shape(contour));
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = -pos.getY(i);
      const px = underlay.centerPx.x + x / underlay.mppX;
      const py = underlay.centerPx.y + z / underlay.mppZ;
      uv[i * 2] = px / underlay.widthPx;
      uv[i * 2 + 1] = 1 - py / underlay.heightPx;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geo;
  }, [floor, widthM, depthM, underlay]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, LIFT_M, 0]} geometry={geometry} receiveShadow userData={{ noExport: true }}>
      <meshStandardMaterial map={texture} roughness={0.95} metalness={0} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  );
}
