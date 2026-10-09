import { test } from "node:test";
import assert from "node:assert/strict";
import { auditPlacement } from "./placement-invariants";
import { buildSceneFromTemplate } from "./scene";
import { listRoomTemplates } from "./templates";
import { resizeSceneMeters } from "./dimensions";
import { resolveSceneFurniture, type FurnitureItem } from "./furnishing";
import { isAgainstWall } from "./wall-anchor";
import { layoutSceneDevices, sceneDims } from "./units";

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

test("tamaño de la tipología: ningún mueble queda afuera por falta de lugar", () => {
  const hidden: string[] = [];
  for (const t of listRoomTemplates()) {
    const scene = buildSceneFromTemplate(t);
    for (const f of resolveSceneFurniture(scene, t.category)) if (f.hiddenBy === "space") hidden.push(`${t.key}: ${f.id}`);
  }
  assert.deepEqual(hidden, []);
});

test("ambientación: cuadros sin tapar equipos de pared y objetos que el usuario puede quitar", () => {
  let decorCount = 0;
  for (const t of listRoomTemplates()) {
    const scene = buildSceneFromTemplate(t);
    const items = resolveSceneFurniture(scene, t.category).filter((f) => !f.hiddenBy);
    const decor = items.filter((f) => f.id.startsWith("decor-"));
    decorCount += decor.length;
    const slots = new Map(scene.slots.map((s) => [s.key, s]));
    const wallUnits = layoutSceneDevices(scene.devices, slots, sceneDims(scene))
      .filter((l) => slots.get(l.device.slotKey)?.mount === "wall")
      .flatMap((l) => l.device.units ?? []);
    for (const art of decor.filter((f) => f.kind === "wall-art")) {
      for (const u of wallUnits) {
        const d = Math.hypot(u.pose.x - art.x, u.pose.z - art.z);
        assert.ok(d >= (art.w ?? 1) / 2 + 0.3, `${t.key}: ${art.id} tapa ${u.id} (${d.toFixed(2)} m)`);
      }
    }
    // Quitar un objeto de ambientación lo saca de la sala.
    const first = decor[0];
    if (first) {
      const without = resolveSceneFurniture({ ...scene, furniture: { removed: [first.id] } }, t.category);
      assert.equal(without.find((f) => f.id === first.id)?.hiddenBy, "user", `${t.key}: ${first.id}`);
    }
  }
  assert.ok(decorCount > 40, `ambientación generada: ${decorCount}`);
});

test("escritorios: el equipo de trabajo mira hacia la silla", () => {
  const t = listRoomTemplates().find((x) => x.key === "office-private-m")!;
  const items = resolveSceneFurniture(buildSceneFromTemplate(t), t.category);
  const desk = items.find((f) => f.id === "desk")!;
  const chair = items.find((f) => f.id === "desk-chair")!;
  assert.equal(chair.hiddenBy, null);
  assert.equal(desk.seat, chair.z < desk.z ? -1 : 1);
});

test("plano: cada mueble dibujado queda exactamente donde está (sin mover, apoyar, ocultar ni sumar objetos)", () => {
  const t = listRoomTemplates().find((x) => x.key === "lobby-m")!;
  const base = buildSceneFromTemplate(t);
  // Muebles del plano a propósito "incómodos": cerca de la pared, pegados entre sí y girados.
  const drawn: FurnitureItem[] = [
    { id: "p-sofa", kind: "sofa", group: "Sillones", x: -1.2, z: -2.1, rotY: 0, mount: "floor", w: 2.1, d: 0.9, fit: true },
    { id: "p-bed", kind: "bed", group: "Cama", x: 1.1, z: -1.4, rotY: 0.3, mount: "floor", w: 1.6, d: 2, fit: true },
    { id: "p-ns", kind: "nightstand", group: "Mesas de luz", x: 2.2, z: -1.9, rotY: 0, mount: "floor", w: 0.45, d: 0.4, fit: true },
    { id: "p-table", kind: "conference-table", group: "Mesa", x: 0, z: 1, rotY: 0, mount: "floor", w: 1.4, d: 0.8, fit: true },
    { id: "p-chair", kind: "side-chair", group: "Sillas", x: 0.9, z: 1, rotY: 1.2, mount: "floor", fit: true },
  ];
  const out = resolveSceneFurniture({ ...base, planFurniture: drawn }, t.category);
  assert.equal(out.length, drawn.length, "no se suman objetos al plano");
  for (const d of drawn) {
    const o = out.find((f) => f.id === d.id)!;
    assert.ok(o, d.id);
    assert.equal(o.hiddenBy, null, d.id);
    assert.deepEqual([o.x, o.z, o.rotY, o.w, o.d], [d.x, d.z, d.rotY, d.w, d.d], d.id);
  }
});

test("muebles de pared: cama y mesas de luz apoyadas contra la pared, mesas de luz pegadas a la cama", () => {
  for (const key of ["hotel-guest-s", "residential-bedroom-m", "hotel-suite-m"]) {
    const t = listRoomTemplates().find((x) => x.key === key)!;
    const scene = buildSceneFromTemplate(t);
    const items = resolveSceneFurniture(scene, t.category).filter((f) => !f.hiddenBy);
    const floor = [
      { x: -scene.widthM / 2, y: -scene.depthM / 2 },
      { x: scene.widthM / 2, y: -scene.depthM / 2 },
      { x: scene.widthM / 2, y: scene.depthM / 2 },
      { x: -scene.widthM / 2, y: scene.depthM / 2 },
    ];
    const bed = items.find((f) => f.kind === "bed")!;
    assert.ok(isAgainstWall(bed, floor), `${key}: cama despegada de la pared`);
    for (const ns of items.filter((f) => f.kind === "nightstand")) {
      assert.ok(isAgainstWall(ns, floor), `${key}: ${ns.id} despegada de la pared`);
      const gap = Math.abs(ns.x - bed.x) - (bed.w ?? 1.6) / 2 - 0.225;
      assert.ok(gap >= 0 && gap <= 0.06, `${key}: ${ns.id} a ${gap.toFixed(2)} m de la cama`);
    }
  }
});
