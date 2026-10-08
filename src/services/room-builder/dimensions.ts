import type { RoomScene } from "./scene";
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

  return relayoutSceneAnchors(resized).scene;
}
