import { test } from "node:test";
import assert from "node:assert/strict";
import { clampPoseToRoom, distributeUnits, normalizeDeviceUnits, surfaceHit, wallOf } from "./units";
import type { SceneDevice } from "./scene";

const dims = { widthM: 6, depthM: 5, heightM: 2.7 };

test("techo: grilla pareja dentro de la sala", () => {
  const poses = distributeUnits({ x: 0, y: 2.65, z: 0, rotY: 0 }, "ceiling", 6, dims);
  assert.equal(poses.length, 6);
  for (const p of poses) {
    assert.equal(p.y, 2.65);
    assert.ok(Math.abs(p.x) < 3 && Math.abs(p.z) < 2.5);
  }
  assert.equal(new Set(poses.map((p) => `${p.x},${p.z}`)).size, 6);
});

test("pared: 4 parlantes → 2 en la pared y 2 en la de enfrente, mirando hacia adentro", () => {
  const poses = distributeUnits({ x: -2.92, y: 2.3, z: 0, rotY: 90 }, "wall", 4, dims);
  assert.equal(poses.length, 4);
  assert.equal(poses.filter((p) => p.x < 0 && p.rotY === 90).length, 2);
  assert.equal(poses.filter((p) => p.x > 0 && p.rotY === -90).length, 2);
});

test("pared: 2 parlantes quedan en la misma pared, separados", () => {
  const poses = distributeUnits({ x: 0, y: 1.4, z: 2.42, rotY: 180 }, "wall", 2, dims);
  assert.ok(poses.every((p) => p.z === 2.42 && p.rotY === 180));
  assert.ok(Math.abs(poses[0].x - poses[1].x) > 1.5);
});

test("rack: uno al lado del otro", () => {
  const poses = distributeUnits({ x: 1, y: 0.45, z: -2, rotY: 0 }, "rack", 3, dims);
  assert.deepEqual(poses.map((p) => p.x), [0.45, 1, 1.55]);
});

test("normaliza unidades: agrega, conserva las ubicadas a mano y recorta", () => {
  const device = {
    id: "d",
    slotKey: "speakers",
    productId: "p",
    designRole: "speaker",
    label: "Parlantes",
    quantity: 3,
    pose: { x: 0, y: 2.65, z: 0, rotY: 0 },
    coverage: null,
    units: [{ id: "keep", pose: { x: 9, y: 2.65, z: 0, rotY: 0 }, placed: true }],
  } as SceneDevice;
  const slot = { mount: "ceiling" as const, pose: { x: 0, y: 2.65, z: 0, rotY: 0 } };
  const out = normalizeDeviceUnits(device, slot, dims);
  assert.equal(out.units?.length, 3);
  const kept = out.units?.find((u) => u.id === "keep");
  assert.ok(kept?.placed);
  assert.equal(kept?.pose.x, 2.92);
  const fewer = normalizeDeviceUnits({ ...out, quantity: 1 }, slot, dims);
  assert.equal(fewer.units?.length, 1);
  assert.equal(fewer.units?.[0].id, "keep");
});

test("arrastre en pared: toma la pared que se ve (la del fondo) y la orienta", () => {
  // cámara afuera, del lado del frente, mirando hacia el fondo
  const hit = surfaceHit({ origin: [0, 1.5, 10], dir: [0, 0, -1] }, "wall", dims);
  assert.equal(hit?.surface, "back");
  assert.equal(hit?.pose.rotY, 0);
  assert.equal(hit?.pose.z, -2.42);
});

test("arrastre en techo y fuera de la sala", () => {
  const hit = surfaceHit({ origin: [1, 8, 1], dir: [0, -1, 0] }, "ceiling", dims);
  assert.equal(hit?.surface, "ceiling");
  assert.equal(hit?.pose.y, 2.65);
  assert.equal(surfaceHit({ origin: [20, 8, 1], dir: [0, -1, 0] }, "ceiling", dims), null);
});

test("pared más cercana y recorte a la sala", () => {
  assert.equal(wallOf({ x: -2.9, y: 2, z: 0.3, rotY: 0 }, dims), "left");
  assert.equal(wallOf({ x: 0.5, y: 2, z: 2.4, rotY: 0 }, dims), "front");
  assert.deepEqual(clampPoseToRoom({ x: 10, y: 9, z: -10, rotY: 0 }, dims), { x: 2.92, y: 2.65, z: -2.42, rotY: 0 });
});
