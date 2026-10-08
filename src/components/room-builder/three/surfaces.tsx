"use client";

/**
 * Materiales PBR del Room Builder.
 *
 * Los muebles y la sala piden un color de la paleta (MAT.wood, MAT.fabric…).
 * Acá cada color se traduce a un material realista con texturas (madera,
 * tela, alfombra, revoque…). Las texturas se cargan en segundo plano y sin
 * suspender: hasta que llegan (o si fallan) se usa el color liso, así el 3D
 * aparece enseguida y nunca queda en blanco.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as THREE from "three";
import { MAT } from "../room-theme";

/** Juegos de texturas en /public/room-builder/textures/<set>/ (CC0, Poly Haven). */
export type TextureSetName = "oak" | "walnut" | "carpet" | "plaster" | "concrete" | "marble" | "fabric" | "leather";

const TEXTURE_ROOT = "/room-builder/textures";
const MAPS = ["diffuse", "normal", "roughness"] as const;
type MapName = (typeof MAPS)[number];
type TextureSet = Partial<Record<MapName, THREE.Texture>>;

/** Carpeta de cada juego (ver public/room-builder/manifest.json). */
const SET_FOLDER: Record<TextureSetName, string> = {
  oak: "oak-floor-light",
  walnut: "walnut-dark",
  carpet: "carpet-office",
  plaster: "plaster-wall",
  concrete: "concrete-polished",
  marble: "marble-tile",
  fabric: "fabric-upholstery",
  leather: "fabric-upholstery",
};

/** Metros que ocupa una repetición de cada textura (tamaño real de la muestra). */
const TILE_METERS: Record<TextureSetName, number> = {
  oak: 1.7,
  walnut: 1,
  carpet: 0.6,
  plaster: 3,
  concrete: 4,
  marble: 1.5,
  fabric: 0.27,
  leather: 0.27,
};

export interface SurfaceSpec {
  color: string;
  roughness: number;
  metalness: number;
  set?: TextureSetName;
  /** Cuánto pesa la textura sobre el color (0 = solo color). */
  normalScale?: number;
  clearcoat?: number;
}

/** Color de la paleta → material. Lo que no está acá queda como color liso. */
export function surfaceFor(color: string, roughness = 0.75, metalness = 0.05): SurfaceSpec {
  switch (color) {
    case MAT.wood:
      return { color: "#a88565", roughness: 0.55, metalness: 0, set: "oak", normalScale: 0.6 };
    case MAT.woodLight:
      return { color: "#d6bb98", roughness: 0.55, metalness: 0, set: "oak", normalScale: 0.6 };
    case MAT.woodDark:
      return { color: "#6b5341", roughness: 0.5, metalness: 0, set: "walnut", normalScale: 0.6 };
    case MAT.fabric:
      return { color: "#5a6577", roughness: 0.95, metalness: 0, set: "fabric", normalScale: 0.8 };
    case MAT.fabricLight:
      return { color: "#b4bcc8", roughness: 0.95, metalness: 0, set: "fabric", normalScale: 0.8 };
    case MAT.fabricWarm:
      return { color: "#8f7a66", roughness: 0.95, metalness: 0, set: "fabric", normalScale: 0.8 };
    case MAT.metal:
      return { color: "#9aa4b2", roughness: 0.32, metalness: 0.85 };
    case MAT.metalDark:
      return { color: "#3b4552", roughness: 0.38, metalness: 0.8 };
    case MAT.black:
      return { color: "#121417", roughness: 0.4, metalness: 0.2, clearcoat: 0.4 };
    case MAT.white:
    case MAT.cream:
      return { color: color === MAT.cream ? "#f2ece2" : "#eef1f4", roughness: 0.45, metalness: 0, clearcoat: 0.3 };
    case MAT.carpet:
      return { color: "#8c95a3", roughness: 1, metalness: 0, set: "carpet", normalScale: 0.9 };
    case MAT.carpetWarm:
      return { color: "#a8998a", roughness: 1, metalness: 0, set: "carpet", normalScale: 0.9 };
    case MAT.concrete:
      return { color: "#c9ced4", roughness: 0.85, metalness: 0, set: "concrete", normalScale: 0.5 };
    case MAT.tile:
      return { color: "#e2ddd6", roughness: 0.3, metalness: 0, set: "marble", normalScale: 0.4 };
    case MAT.stage:
      return { color: "#232a36", roughness: 0.7, metalness: 0, set: "carpet", normalScale: 0.6 };
    default:
      return { color, roughness, metalness };
  }
}

type Library = {
  sets: Partial<Record<TextureSetName, TextureSet>>;
  /** Cache de materiales ya armados (uno por combinación). */
  cache: Map<string, THREE.MeshPhysicalMaterial>;
  anisotropy: number;
};

const SurfaceContext = createContext<Library | null>(null);

function loadSet(loader: THREE.TextureLoader, name: TextureSetName, anisotropy: number): Promise<TextureSet> {
  const tile = TILE_METERS[name];
  return Promise.all(
    MAPS.map(
      (map) =>
        new Promise<[MapName, THREE.Texture | null]>((resolve) => {
          loader.load(
            `${TEXTURE_ROOT}/${SET_FOLDER[name]}/${map}.webp`,
            (tex) => {
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
              tex.repeat.set(1 / tile, 1 / tile);
              tex.anisotropy = anisotropy;
              tex.colorSpace = map === "diffuse" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
              resolve([map, tex]);
            },
            undefined,
            () => resolve([map, null]),
          );
        }),
    ),
  ).then((pairs) => Object.fromEntries(pairs.filter(([, t]) => t)) as TextureSet);
}

/** Carga las texturas una vez y las comparte con toda la escena. */
export function SurfaceProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [sets, setSets] = useState<Library["sets"]>({});
  const anisotropy = 8;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const loader = new THREE.TextureLoader();
    const names = (Object.keys(TILE_METERS) as TextureSetName[]).filter((n) => n !== "leather");
    Promise.all(names.map((n) => loadSet(loader, n, anisotropy).then((set) => [n, set] as const))).then((entries) => {
      if (alive) setSets(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  const value = useMemo<Library>(() => ({ sets, cache: new Map(), anisotropy }), [sets]);
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>;
}

/** Material compartido para un color de la paleta (con texturas si ya cargaron). */
export function useSurface(color: string, roughness?: number, metalness?: number, tint?: string): THREE.MeshPhysicalMaterial {
  const lib = useContext(SurfaceContext);
  const spec = surfaceFor(color, roughness, metalness);
  const set = spec.set && lib ? lib.sets[spec.set] : undefined;
  const key = `${tint ?? spec.color}|${spec.roughness}|${spec.metalness}|${spec.set ?? ""}|${set ? "tex" : "flat"}`;

  return useMemo(() => {
    const cached = lib?.cache.get(key);
    if (cached) return cached;
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(tint ?? spec.color),
      roughness: spec.roughness,
      metalness: spec.metalness,
      clearcoat: spec.clearcoat ?? 0,
      clearcoatRoughness: 0.35,
      envMapIntensity: 1,
    });
    if (set?.diffuse) mat.map = set.diffuse;
    if (set?.normal) {
      mat.normalMap = set.normal;
      const s = spec.normalScale ?? 0.6;
      mat.normalScale = new THREE.Vector2(s, s);
    }
    if (set?.roughness) mat.roughnessMap = set.roughness;
    lib?.cache.set(key, mat);
    return mat;
  }, [lib, key, spec.color, spec.roughness, spec.metalness, spec.clearcoat, spec.normalScale, set, tint]);
}

/** Material para superficies grandes (piso, paredes) con su propia escala de textura. */
export function useLargeSurface(set: TextureSetName, color: string, roughness: number, repeatMeters?: [number, number]) {
  const lib = useContext(SurfaceContext);
  const textures = lib?.sets[set];
  return useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness, metalness: 0, envMapIntensity: 0.9 });
    if (!textures) return mat;
    const clone = (t?: THREE.Texture) => {
      if (!t) return null;
      const c = t.clone();
      c.needsUpdate = true;
      if (repeatMeters) c.repeat.set(repeatMeters[0] / TILE_METERS[set], repeatMeters[1] / TILE_METERS[set]);
      return c;
    };
    // El revoque solo aporta relieve: su foto es cálida y teñía las paredes de naranja.
    if (set !== "plaster") mat.map = clone(textures.diffuse);
    mat.normalMap = clone(textures.normal);
    mat.roughnessMap = clone(textures.roughness);
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.7, 0.7);
    return mat;
  }, [textures, color, roughness, set, repeatMeters?.[0], repeatMeters?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
}
