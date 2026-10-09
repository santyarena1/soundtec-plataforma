import { test } from "node:test";
import assert from "node:assert/strict";
import { auditPlacement } from "./placement-invariants";
import { buildSceneFromTemplate } from "./scene";
import { listRoomTemplates } from "./templates";
import { resizeSceneMeters } from "./dimensions";

/** Cada tipología en varios tamaños y cantidades: ubicación 3D sin errores. */
test("tipologías × tamaños × cantidades: cada equipo en su superficie, dentro de la sala y sin encimarse", () => {
  const problems: string[] = [];
  let scenes = 0;
  for (const t of listRoomTemplates()) {
    for (const [sx, sz] of [
      [1, 1],
      [0.6, 0.6],
      [1.6, 1.6],
      [2, 0.7],
    ] as const) {
      for (const mult of [1, 2, 4]) {
        // Igual que en la plataforma: se cambia la cantidad y se redimensiona con la misma función.
        const base = buildSceneFromTemplate(t);
        const withQty = { ...base, devices: base.devices.map((d) => ({ ...d, quantity: Math.max(1, d.quantity * mult) })) };
        const scene = resizeSceneMeters(withQty, { widthM: Math.max(2.5, t.widthM * sx), depthM: Math.max(2.5, t.depthM * sz) });
        scenes++;
        for (const v of auditPlacement(scene, t.category)) problems.push(`${t.key} ${sx}×${sz} x${mult}: [${v.rule}] ${v.detail}`);
      }
    }
  }
  const byRule = new Map<string, number>();
  for (const p of problems) {
    const rule = p.match(/\[(.+?)\]/)?.[1] ?? "?";
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
  }
  assert.equal(problems.length, 0, `${problems.length} problemas en ${scenes} salas: ${JSON.stringify([...byRule])}\n${problems.slice(0, 30).join("\n")}`);
});
