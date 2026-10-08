import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSceneFromTemplate, getRoomTemplate } from "./index";
import { resizeSceneMeters } from "./dimensions";

describe("resizeSceneMeters", () => {
  it("cambia metros y escala poses", () => {
    const t = getRoomTemplate("hotel-guest-s");
    assert.ok(t);
    const scene = buildSceneFromTemplate(t);
    const next = resizeSceneMeters(scene, { widthM: 6, depthM: 5, heightM: 2.8 });
    assert.equal(next.widthM, 6);
    assert.equal(next.depthM, 5);
    assert.equal(next.areaM2, 30);
    assert.ok(next.devices[0]);
    // TV está en z positivo respecto al centro; al agrandar debe moverse
    assert.notEqual(next.devices[0]!.pose.z, scene.devices[0]!.pose.z);
  });
});
