import { buildSceneFromTemplate } from "@/services/room-builder/scene";
import { listRoomTemplates } from "@/services/room-builder/templates";
import { resolveSceneFurniture } from "@/services/room-builder/furnishing";
import { resizeSceneMeters } from "@/services/room-builder/dimensions";
for (const t of listRoomTemplates()) {
  for (const [sx, sz] of [[1, 1], [0.6, 0.6], [1.6, 1.6], [2, 0.7]] as const) {
    const scene = resizeSceneMeters(buildSceneFromTemplate(t), { widthM: Math.max(2.5, t.widthM * sx), depthM: Math.max(2.5, t.depthM * sz) });
    const all = resolveSceneFurniture(scene, t.category).filter((f) => !f.id.startsWith("decor-"));
    const hidden = all.filter((f) => f.hiddenBy === "space");
    if (hidden.length) console.log(`${t.key} ${sx}x${sz} (${scene.widthM}x${scene.depthM}): ${hidden.length}/${all.length} ocultos: ${hidden.map((f) => f.id).join(" ")}`);
  }
}
