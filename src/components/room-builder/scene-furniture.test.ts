import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roomTheme } from "./room-theme";

describe("roomTheme", () => {
  it("da paletas distintas por tipología", () => {
    const vc = roomTheme("videoconference", "vc-meeting-m");
    const hotel = roomTheme("hotel", "hotel-guest-s");
    const pool = roomTheme("hotel", "hotel-pool-bar-m");
    const event = roomTheme("event", "event-banquet-l");
    const control = roomTheme("control-room", "control-room-m");

    assert.notEqual(vc.floor, hotel.floor);
    assert.notEqual(hotel.floor, pool.floor);
    assert.equal(pool.outdoor, true);
    assert.equal(pool.envPreset, "sunset");
    assert.notEqual(event.wall, vc.wall);
    assert.ok(control.ambient < vc.ambient);
    assert.ok(vc.envPreset);
  });
});
