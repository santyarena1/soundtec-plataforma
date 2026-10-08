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
