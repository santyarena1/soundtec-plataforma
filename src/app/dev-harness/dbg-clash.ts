import { buildSceneFromTemplate } from "@/services/room-builder/scene";
import { listRoomTemplates } from "@/services/room-builder/templates";
import { resolveSceneFurniture } from "@/services/room-builder/furnishing";
import { clearanceBetween, footprint, occupiesFloor, overlaps } from "@/services/room-builder/furniture-fit";
import { resizeSceneMeters } from "@/services/room-builder/dimensions";
const [sx, sz] = (process.argv[2] ?? "1x1").split("x").map(Number) as [number, number];
for (const t of listRoomTemplates()) {
  const scene = resizeSceneMeters(buildSceneFromTemplate(t), { widthM: Math.max(2.5, t.widthM * sx), depthM: Math.max(2.5, t.depthM * sz) });
  const floor = [{ x: -scene.widthM / 2, y: -scene.depthM / 2 }, { x: scene.widthM / 2, y: -scene.depthM / 2 }, { x: scene.widthM / 2, y: scene.depthM / 2 }, { x: -scene.widthM / 2, y: scene.depthM / 2 }];
  const all = resolveSceneFurniture(scene, t.category).filter((f) => !f.id.startsWith("decor-"));
  const vis = all.filter((f) => !f.hiddenBy && occupiesFloor(f));
  for (const h of all.filter((f) => f.hiddenBy === "space")) {
    const by = vis.filter((v) => overlaps(footprint(v), footprint(h), -clearanceBetween(v, h, floor)));
    console.log(`${t.key}: ${h.id}(${h.kind}) <- ${by.map((b) => `${b.id}(${b.kind})`).join(", ") || "fuera de la sala"}`);
  }
}
