import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getRoomTemplate,
  listRoomTemplates,
  listTemplatesByCategory,
  resizeTemplate,
} from "./templates";

describe("ROOM_TEMPLATES", () => {
  it("incluye tipologías máximas del go-live interno", () => {
    const keys = listRoomTemplates().map((t) => t.key);
    for (const required of [
      "vc-huddle-s",
      "vc-boardroom-l",
      "classroom-m",
      "training-l",
      "hotel-guest-s",
      "hotel-suite-m",
      "event-banquet-l",
      "residential-living-m",
      "lobby-m",
      "control-room-m",
      "signage-corridor-s",
    ]) {
      assert.ok(keys.includes(required), `falta template ${required}`);
    }
  });

  it("cada template tiene slots con rol y presets de cámara", () => {
    for (const t of listRoomTemplates()) {
      assert.ok(t.slots.length >= 1, t.key);
      assert.ok(t.cameraPresets.includes("general"), t.key);
      assert.ok(t.areaM2 > 0 && t.widthM > 0 && t.depthM > 0, t.key);
    }
  });

  it("filtra por categoría y redimensiona área", () => {
    assert.ok(listTemplatesByCategory("videoconference").length >= 3);
    const base = getRoomTemplate("vc-boardroom-l");
    assert.ok(base);
    const bigger = resizeTemplate(base, 40);
    assert.equal(bigger.areaM2, 40);
    assert.ok(bigger.widthM * bigger.depthM > 35);
  });
});
