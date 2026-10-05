import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { argentinaInputToIso, toArgentinaInput } from "./datetime";

describe("fechas del evento en hora argentina", () => {
  it("UTC → datetime-local de Buenos Aires (UTC-3)", () => {
    assert.equal(toArgentinaInput("2026-10-15T12:30:00.000Z"), "2026-10-15T09:30");
    assert.equal(toArgentinaInput("2026-10-15T01:05:00.000Z"), "2026-10-14T22:05");
  });
  it("datetime-local tipeado se interpreta como hora argentina", () => {
    assert.equal(argentinaInputToIso("2026-10-15T09:30"), "2026-10-15T12:30:00.000Z");
    assert.equal(argentinaInputToIso("2026-10-14T22:05"), "2026-10-15T01:05:00.000Z");
  });
  it("ida y vuelta", () => assert.equal(argentinaInputToIso(toArgentinaInput("2026-07-01T23:59:00.000Z")), "2026-07-01T23:59:00.000Z"));
  it("acepta segundos opcionales", () => assert.equal(argentinaInputToIso("2026-10-15T09:30:15"), "2026-10-15T12:30:15.000Z"));
  it("valor inválido → null", () => assert.equal(argentinaInputToIso("basura"), null));
});
