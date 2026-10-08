"use client";

/**
 * Producto real en la sala: la foto del catálogo sin fondo, a escala real
 * (medidas del producto) y con espesor. La foto se apila en capas a lo largo
 * de la profundidad, así de costado se ve como un objeto y no como una
 * figurita. También proyecta su silueta como sombra.
 * Mientras carga, o si el producto no tiene foto recortable, se ve el modelo
 * genérico del tipo de equipo.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { ProductSizeCm } from "@/services/room-builder/scene";

/** Lado mayor (m) cuando el producto no tiene medidas cargadas. */
const DEFAULT_SPAN_M: Record<string, number> = {
  speaker: 0.36,
  camera: 0.26,
  mic: 0.2,
  touch: 0.26,
  codec: 0.44,
  processor: 0.44,
};
const DEFAULT_DEPTH_M = 0.05;
const LAYERS = 10;
/** Tinte de los laterales: el borde del producto, más oscuro que el frente. */
const SIDE_TINT = "#6b7078";

type Loaded = { texture: THREE.Texture; aspect: number };
const cache = new Map<string, Promise<Loaded | null>>();

function loadCutout(productId: string): Promise<Loaded | null> {
  const hit = cache.get(productId);
  if (hit) return hit;
  const job = new Promise<Loaded | null>((resolve) => {
    new THREE.TextureLoader().load(
      `/api/room-builder/cutout/${encodeURIComponent(productId)}`,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        const img = texture.image as { width?: number; height?: number } | undefined;
        const aspect = img?.width && img?.height ? img.width / img.height : 1;
        resolve({ texture, aspect });
      },
      undefined,
      () => resolve(null),
    );
  });
  cache.set(productId, job);
  return job;
}

function useCutout(productId: string | null): Loaded | null | undefined {
  const [state, setState] = useState<Loaded | null | undefined>(undefined);
  useEffect(() => {
    if (!productId) {
      setState(null);
      return;
    }
    let alive = true;
    setState(undefined);
    loadCutout(productId).then((r) => alive && setState(r));
    return () => {
      alive = false;
    };
  }, [productId]);
  return state;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ancho, alto y profundidad (m) respetando la proporción de la foto. */
export function photoDimensions(aspect: number, sizeCm: ProductSizeCm | null | undefined, role: string) {
  const w = sizeCm?.w ? sizeCm.w / 100 : null;
  const h = sizeCm?.h ? sizeCm.h / 100 : null;
  let width: number;
  let height: number;
  if (w) {
    width = w;
    height = w / aspect;
  } else if (h) {
    height = h;
    width = h * aspect;
  } else {
    const span = DEFAULT_SPAN_M[role] ?? 0.3;
    width = aspect >= 1 ? span : span * aspect;
    height = aspect >= 1 ? span / aspect : span;
  }
  const depth = sizeCm?.d ? sizeCm.d / 100 : DEFAULT_DEPTH_M;
  return { width: clamp(width, 0.04, 2.5), height: clamp(height, 0.03, 2.5), depth: clamp(depth, 0.01, 0.2) };
}

function PhotoSlab({ texture, width, height, depth }: { texture: THREE.Texture; width: number; height: number; depth: number }) {
  const { front, side, shadow } = useMemo(() => {
    const front = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide });
    const side = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness: 0.7, metalness: 0.1, color: SIDE_TINT, side: THREE.DoubleSide });
    const shadow = new THREE.MeshDepthMaterial({ map: texture, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
    return { front, side, shadow };
  }, [texture]);
  useEffect(
    () => () => {
      front.dispose();
      side.dispose();
      shadow.dispose();
    },
    [front, side, shadow],
  );

  return (
    <group>
      {Array.from({ length: LAYERS }, (_, i) => {
        const t = i / (LAYERS - 1);
        const isFace = i === 0 || i === LAYERS - 1;
        return (
          <mesh
            key={i}
            position={[0, 0, depth / 2 - t * depth]}
            material={isFace ? front : side}
            castShadow={i === 0}
            customDepthMaterial={i === 0 ? shadow : undefined}
          >
            <planeGeometry args={[width, height]} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Foto real del producto con espesor. `placement`:
 * - "wall": centrada en el punto de montaje, mirando al frente.
 * - "surface": apoyada (la base en el punto de montaje), sobre mesa o mueble.
 * - "ceiling": plana contra el techo, mirando hacia abajo.
 */
export function ProductPhotoModel({
  productId,
  sizeCm,
  role,
  placement,
  fallback,
}: {
  productId: string | null;
  sizeCm?: ProductSizeCm | null;
  role: string;
  placement: "wall" | "surface" | "ceiling";
  fallback: ReactNode;
}) {
  const cutout = useCutout(productId);
  if (!cutout) return <>{fallback}</>;
  // En el techo solo sirven las fotos de frente (rejilla redonda o cuadrada).
  if (placement === "ceiling" && (cutout.aspect < 0.75 || cutout.aspect > 1.33)) return <>{fallback}</>;

  const { width, height, depth } = photoDimensions(cutout.aspect, sizeCm, role);
  if (placement === "ceiling") {
    return (
      <group rotation={[Math.PI / 2, 0, 0]} position={[0, -0.006, 0]}>
        <PhotoSlab texture={cutout.texture} width={width} height={height} depth={Math.min(depth, 0.01)} />
      </group>
    );
  }
  return (
    <group position={[0, placement === "surface" ? height / 2 : 0, 0]}>
      <PhotoSlab texture={cutout.texture} width={width} height={height} depth={depth} />
    </group>
  );
}
