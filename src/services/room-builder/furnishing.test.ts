import { test } from "node:test";
import assert from "node:assert/strict";
import { displayCovers, furnitureGroups, layoutFurniture, resolveFurniture } from "./furnishing";

const dims = { widthM: 8, depthM: 7, heightM: 3 };

test("aula: pizarrón, atril, escritorio y pupitres con ids estables", () => {
  const items = layoutFurniture("classroom-m", "classroom", dims);
  const ids = items.map((i) => i.id);
  assert.ok(ids.includes("whiteboard") && ids.includes("lectern") && ids.includes("desk-r0c0"));
  assert.equal(new Set(ids).size, ids.length);
});

test("todas las tipologías generan ids únicos", () => {
  for (const [key, cat] of [
    ["vc-meeting-m", "videoconference"],
    ["training-l", "training"],
    ["hotel-guest-s", "hotel"],
    ["hotel-suite-m", "hotel"],
    ["hotel-pool-bar-m", "hotel"],
    ["hotel-common-m", "hotel"],
    ["lobby-m", "lobby"],
    ["event-banquet-l", "event"],
    ["residential-living-m", "residential"],
    ["control-room-m", "control-room"],
    ["signage-corridor-s", "signage"],
  ]) {
    const ids = layoutFurniture(key, cat, dims).map((i) => i.id);
    assert.ok(ids.length > 0, key);
    assert.equal(new Set(ids).size, ids.length, key);
  }
});

test("una pantalla sobre el pizarrón lo oculta; una en otra pared no", () => {
  const board = layoutFurniture("classroom-m", "classroom", dims).find((i) => i.id === "whiteboard");
  assert.ok(board);
  assert.equal(displayCovers(board, { x: 0.3, y: 1.4, z: 3.4, rotY: 180 }), true);
  assert.equal(displayCovers(board, { x: -3.9, y: 1.4, z: 0, rotY: 90 }), false);
  assert.equal(displayCovers(board, { x: 3.5, y: 1.4, z: 3.4, rotY: 180 }), false);
});

test("resolver: quitados, movidos y tapados por pantalla", () => {
  const items = resolveFurniture(
    "classroom-m",
    "classroom",
    dims,
    { removed: ["lectern"], moved: { "teacher-desk": { x: 99, z: 0, rotY: 1 } } },
    [{ x: 0, y: 1.5, z: 3.42, rotY: 180 }],
  );
  assert.equal(items.find((i) => i.id === "lectern")?.hiddenBy, "user");
  assert.equal(items.find((i) => i.id === "whiteboard")?.hiddenBy, "display");
  const desk = items.find((i) => i.id === "teacher-desk");
  assert.equal(desk?.x, 4);
  assert.equal(desk?.rotY, 1);
  const groups = furnitureGroups(items);
  assert.equal(groups.find((g) => g.group === "Pizarrón")?.hiddenByDisplay, 1);
});
