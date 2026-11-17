// Banco local (no se commitea): ejemplos de cada problema de ubicación 3D.
import { auditPlacement } from "@/services/room-builder/placement-invariants";
import { buildSceneFromTemplate } from "@/services/room-builder/scene";
import { listRoomTemplates } from "@/services/room-builder/templates";
import { resizeSceneMeters } from "@/services/room-builder/dimensions";

const want = process.argv[2] ?? "";
const out: string[] = [];
for (const t of listRoomTemplates()) {
  for (const [sx, sz] of [[1, 1], [0.6, 0.6], [1.6, 1.6], [2, 0.7]] as const) {
    for (const mult of [1, 2, 4]) {
      const base = buildSceneFromTemplate(t);
      const withQty = { ...base, devices: base.devices.map((d) => ({ ...d, quantity: Math.max(1, d.quantity * mult) })) };
      const scene = resizeSceneMeters(withQty, { widthM: Math.max(2.5, t.widthM * sx), depthM: Math.max(2.5, t.depthM * sz) });
      for (const v of auditPlacement(scene, t.category)) if (!want || v.rule === want) out.push(`${t.key} ${sx}x${sz} x${mult} ${scene.widthM}x${scene.depthM}: [${v.rule}] ${v.detail}`);
    }
  }
}
console.log(out.length);
console.log(out.slice(0, Number(process.argv[3] ?? 15)).join("\n"));
