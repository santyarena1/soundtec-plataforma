import { buildSceneFromTemplate } from "@/services/room-builder/scene";
import { listRoomTemplates } from "@/services/room-builder/templates";
import { resolveSceneFurniture } from "@/services/room-builder/furnishing";
import { layoutSceneDevices, sceneDims } from "@/services/room-builder/units";
let bad = 0;
for (const t of listRoomTemplates()) {
  const scene = buildSceneFromTemplate(t);
  const items = resolveSceneFurniture(scene, t.category).filter((f) => !f.hiddenBy);
  const decor = items.filter((f) => f.id.startsWith("decor-"));
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  const wallUnits = layoutSceneDevices(scene.devices, slots, sceneDims(scene)).filter((l) => slots.get(l.device.slotKey)?.mount === "wall").flatMap((l) => l.device.units ?? []);
  for (const a of decor.filter((f) => f.kind === "wall-art")) {
    for (const u of wallUnits) {
      const d = Math.hypot(u.pose.x - a.x, u.pose.z - a.z);
      if (d < (a.w ?? 1) / 2 + 0.3 && Math.abs(u.pose.y - (a.y ?? 1.5)) < 1) { bad++; console.log("CHOQUE", t.key, a.id, u.id, d.toFixed(2)); }
    }
  }
  const seats = items.filter((f) => f.seat != null).map((f) => `${f.id}:${f.seat}`);
  console.log(t.key.padEnd(24), decor.map((f) => f.kind).join(", ") || "—", seats.length ? `| ${seats.join(" ")}` : "");
}
console.log("choques", bad);
