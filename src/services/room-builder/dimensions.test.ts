import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSceneFromTemplate, getRoomTemplate } from "./index";
import { resizeSceneMeters } from "./dimensions";

describe("resizeSceneMeters", () => {
  it("cambia metros y reancla poses a la tipología", () => {
    const t = getRoomTemplate("hotel-guest-s");
    assert.ok(t);
    const scene = buildSceneFromTemplate(t);
    const next = resizeSceneMeters(scene, { widthM: 6, depthM: 5, heightM: 2.8 });
    assert.equal(next.widthM, 6);
    assert.equal(next.depthM, 5);
    assert.equal(next.areaM2, 30);
    const tv = next.devices.find((d) => d.slotKey === "tv");
    assert.ok(tv);
    // TV pegada a la pared frontal (+Z)
    assert.ok(Math.abs(tv!.pose.z - (5 / 2 - 0.08)) < 0.05);
  });
});

describe("resizeSceneMeters con forma libre", () => {
  it("estira las paredes del polígono y recalcula la superficie", () => {
    const t = getRoomTemplate("hotel-guest-s");
    assert.ok(t);
    const base = resizeSceneMeters(buildSceneFromTemplate(t), { widthM: 4, depthM: 4 });
    const floorPolygon = [
      { x: -2, y: -2 },
      { x: 2, y: -2 },
      { x: 2, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 2 },
      { x: -2, y: 2 },
    ];
    const scene = { ...base, plan: { enabled: true as const, imageUrl: "", metersPerPixel: 0.01, imageWidthPx: 100, imageHeightPx: 100, heightM: base.heightM, walls: [], floorPolygon } };
    const next = resizeSceneMeters(scene, { widthM: 8, depthM: 4 });
    assert.deepEqual(next.plan?.floorPolygon[1], { x: 4, y: -2 });
    assert.equal(next.plan?.walls.length, 6);
    assert.equal(next.areaM2, 24);
  });
});
