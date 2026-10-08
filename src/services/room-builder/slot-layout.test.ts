import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSceneFromTemplate } from "./scene";
import { getRoomTemplate } from "./templates";
import {
  hotelGuestAnchors,
  layoutSlotsForTemplate,
  relayoutSceneAnchors,
  roomAnchors,
} from "./slot-layout";

describe("slot-layout", () => {
  it("ancla TV de hotel a la pared frontal, no al centro", () => {
    const t = getRoomTemplate("hotel-guest-s");
    assert.ok(t);
    const slots = layoutSlotsForTemplate(
      t.key,
      t.widthM,
      t.depthM,
      t.heightM,
    );
    const tv = slots.find((s) => s.key === "tv");
    const a = roomAnchors({
      widthM: t.widthM,
      depthM: t.depthM,
      heightM: t.heightM,
    });
    assert.ok(tv);
    assert.ok(Math.abs(tv!.pose.z - a.frontZ) < 0.05);
    assert.equal(tv!.pose.rotY, 180);
  });

  it("touch de habitación va sobre la mesita", () => {
    const t = getRoomTemplate("hotel-guest-s")!;
    const g = hotelGuestAnchors({
      widthM: t.widthM,
      depthM: t.depthM,
      heightM: t.heightM,
    });
    const touch = layoutSlotsForTemplate(
      t.key,
      t.widthM,
      t.depthM,
      t.heightM,
    ).find((s) => s.key === "touch");
    assert.ok(touch);
    assert.ok(Math.abs(touch!.pose.x - g.nightstandX) < 0.05);
    assert.ok(Math.abs(touch!.pose.y - g.nightstandTopY) < 0.05);
    assert.ok(Math.abs(touch!.pose.z - g.nightstandZ) < 0.05);
  });

  it("relayout corrige poses flotantes de escenas viejas", () => {
    const t = getRoomTemplate("hotel-guest-s")!;
    const scene = buildSceneFromTemplate(t);
    // simula el bug: TV en el medio
    scene.devices = scene.devices.map((d) =>
      d.slotKey === "tv"
        ? { ...d, pose: { x: 0, y: 1.3, z: 0.2, rotY: 180 } }
        : d,
    );
    scene.slots = scene.slots.map((s) =>
      s.key === "tv"
        ? { ...s, pose: { x: 0, y: 1.3, z: 0.2, rotY: 180 } }
        : s,
    );
    const { scene: fixed, changed } = relayoutSceneAnchors(scene);
    assert.equal(changed, true);
    const tv = fixed.devices.find((d) => d.slotKey === "tv")!;
    const a = roomAnchors({
      widthM: t.widthM,
      depthM: t.depthM,
      heightM: t.heightM,
    });
    assert.ok(Math.abs(tv.pose.z - a.frontZ) < 0.05);
  });
});
