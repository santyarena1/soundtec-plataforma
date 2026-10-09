import type { RoomScene } from "./scene";
import { boundsFromPolygon, wallsFromPolygon } from "./plan-mode";
import { relayoutSceneAnchors } from "./slot-layout";

/** Redimensiona la sala en metros y reancla equipos a paredes/muebles. */
export function resizeSceneMeters(
  scene: RoomScene,
  next: { widthM: number; depthM: number; heightM?: number },
): RoomScene {
  const widthM = Math.max(1.5, Math.min(80, next.widthM));
  const depthM = Math.max(1.5, Math.min(80, next.depthM));
  const heightM = Math.max(
    2.2,
    Math.min(12, next.heightM ?? scene.heightM),
  );

  const resized: RoomScene = {
    ...scene,
    widthM: Math.round(widthM * 100) / 100,
    depthM: Math.round(depthM * 100) / 100,
    heightM: Math.round(heightM * 100) / 100,
    areaM2: Math.round(widthM * depthM * 100) / 100,
  };

  // El plano del piso se estira con la sala (mismos píxeles, más o menos metros).
  if (scene.planUnderlay && scene.widthM > 0 && scene.depthM > 0) {
    resized.planUnderlay = {
      ...scene.planUnderlay,
      mppX: (scene.planUnderlay.mppX * resized.widthM) / scene.widthM,
      mppZ: (scene.planUnderlay.mppZ * resized.depthM) / scene.depthM,
    };
  }

  // Los muebles del plano se estiran con la sala.
  if (scene.planFurniture?.length && scene.widthM > 0 && scene.depthM > 0) {
    const fx = resized.widthM / scene.widthM;
    const fz = resized.depthM / scene.depthM;
    resized.planFurniture = scene.planFurniture.map((it) => ({ ...it, x: Math.round(it.x * fx * 100) / 100, z: Math.round(it.z * fz * 100) / 100 }));
  }

  // Forma libre (desde el plano): las paredes se estiran con la sala.
  if (scene.plan?.enabled && scene.plan.floorPolygon.length >= 3) {
    const sx = resized.widthM / (scene.widthM || resized.widthM);
    const sz = resized.depthM / (scene.depthM || resized.depthM);
    const floorPolygon = scene.plan.floorPolygon.map((p) => ({ x: Math.round(p.x * sx * 100) / 100, y: Math.round(p.y * sz * 100) / 100 }));
    resized.plan = { ...scene.plan, heightM: resized.heightM, floorPolygon, walls: wallsFromPolygon(floorPolygon) };
    resized.areaM2 = boundsFromPolygon(floorPolygon).areaM2;
  }

  return relayoutSceneAnchors(resized).scene;
}
