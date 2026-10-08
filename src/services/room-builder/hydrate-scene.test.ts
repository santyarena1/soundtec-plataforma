import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSceneFromTemplate } from "./scene";
import { getRoomTemplate } from "./templates";
import {
  hydrateRoomScene,
  rebuildSceneKeepingProducts,
} from "./hydrate-scene";

describe("hydrateRoomScene", () => {
  it("repara metros en 0 y crea devices por slot", () => {
    const t = getRoomTemplate("hotel-guest-s")!;
    const { scene, changed, rebuilt } = hydrateRoomScene(
      {
        version: 1,
        templateKey: "hotel-guest-s",
        widthM: 0,
        depthM: 0,
        heightM: 0,
        areaM2: 0,
        cameraPreset: "general",
        coverageView: "zones",
        selectedSlotKey: null,
        slots: [],
        devices: [],
      },
      { templateKey: "hotel-guest-s" },
    );
    assert.equal(changed, true);
    assert.equal(rebuilt, true);
    assert.ok(scene.widthM >= 1.5);
    assert.ok(scene.depthM >= 1.5);
    assert.equal(scene.devices.length, scene.slots.length);
    assert.ok(scene.devices.some((d) => d.slotKey === "tv"));
    assert.ok(Math.abs(scene.widthM - t.widthM) < 0.01);
  });

  it("rebuild conserva productos", () => {
    const t = getRoomTemplate("hotel-guest-s")!;
    const scene = buildSceneFromTemplate(t);
    scene.devices = scene.devices.map((d) =>
      d.slotKey === "tv"
        ? {
            ...d,
            productId: "prod-1",
            productName: "TV Demo",
            brandName: "Samsung",
          }
        : d,
    );
    const next = rebuildSceneKeepingProducts(scene, "hotel-guest-s");
    const tv = next.devices.find((d) => d.slotKey === "tv")!;
    assert.equal(tv.productId, "prod-1");
    assert.equal(tv.productName, "TV Demo");
    assert.ok(Math.abs(tv.pose.z - (next.depthM / 2 - 0.08)) < 0.05);
  });
});
