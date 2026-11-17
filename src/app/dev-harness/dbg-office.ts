import { buildSceneFromTemplate } from "@/services/room-builder/scene";
import { listRoomTemplates } from "@/services/room-builder/templates";
import { resolveSceneFurniture } from "@/services/room-builder/furnishing";
const key = process.argv[2] ?? "office-private-m";
const t = listRoomTemplates().find((x) => x.key === key)!;
const scene = buildSceneFromTemplate(t);
console.log(scene.widthM, scene.depthM);
for (const f of resolveSceneFurniture(scene, t.category)) console.log(f.id.padEnd(16), f.kind.padEnd(14), f.x, f.z, (f.rotY ?? 0).toFixed(2), f.w ?? "", f.d ?? "", f.hiddenBy ?? "");
