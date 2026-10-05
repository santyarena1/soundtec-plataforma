/**
 * Bienvenida: obligatoria si vino por QR de un evento vigente, opcional
 * (con "Saltear") si no, y nunca más si ya dejó datos o salteó.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventStatus } from "./event-status";
import { decideWelcome } from "./welcome-gate";

const d = (s: string) => new Date(s);

describe("eventStatus", () => {
  const ev = { startsAt: d("2026-10-10T09:00:00Z"), endsAt: d("2026-10-12T20:00:00Z") };
  it("PROGRAMADO antes de empezar", () => assert.equal(eventStatus(ev, d("2026-10-09T00:00:00Z")), "SCHEDULED"));
  it("VIGENTE durante", () => assert.equal(eventStatus(ev, d("2026-10-11T00:00:00Z")), "LIVE"));
  it("TERMINADO después", () => assert.equal(eventStatus(ev, d("2026-10-13T00:00:00Z")), "ENDED"));
});

describe("decideWelcome", () => {
  it("no muestra si ya dejó datos", () =>
    assert.equal(decideWelcome({ hasLead: true, skipped: false, qrEventLive: true }), "NONE"));
  it("obligatoria si vino de un QR de evento vigente", () =>
    assert.equal(decideWelcome({ hasLead: false, skipped: false, qrEventLive: true }), "REQUIRED"));
  it("obligatoria aunque haya salteado antes, si ahora vino por QR vigente", () =>
    assert.equal(decideWelcome({ hasLead: false, skipped: true, qrEventLive: true }), "REQUIRED"));
  it("opcional sin QR vigente", () =>
    assert.equal(decideWelcome({ hasLead: false, skipped: false, qrEventLive: false }), "OPTIONAL"));
  it("no muestra si salteó y no hay QR vigente", () =>
    assert.equal(decideWelcome({ hasLead: false, skipped: true, qrEventLive: false }), "NONE"));
});
