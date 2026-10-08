import type { RoomScene } from "./scene";

/** Redimensiona la sala en metros y escala poses de slots/dispositivos. */
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
  const sx = widthM / Math.max(scene.widthM, 0.01);
  const sz = depthM / Math.max(scene.depthM, 0.01);
  const sy = heightM / Math.max(scene.heightM, 0.01);

  const scalePose = <T extends { x: number; y: number; z: number; rotY: number }>(
    pose: T,
  ): T => ({
    ...pose,
    x: Math.round(pose.x * sx * 100) / 100,
    y: Math.round(pose.y * sy * 100) / 100,
    z: Math.round(pose.z * sz * 100) / 100,
  });

  return {
    ...scene,
    widthM: Math.round(widthM * 100) / 100,
    depthM: Math.round(depthM * 100) / 100,
    heightM: Math.round(heightM * 100) / 100,
    areaM2: Math.round(widthM * depthM * 100) / 100,
    slots: scene.slots.map((slot) => ({
      ...slot,
      pose: scalePose(slot.pose),
    })),
    devices: scene.devices.map((d) => ({
      ...d,
      pose: scalePose(d.pose),
    })),
  };
}
