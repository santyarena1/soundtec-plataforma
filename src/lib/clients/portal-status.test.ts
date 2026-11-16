import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientPortalSummary, portalUserStatus, type PortalUserInput } from "./portal-status";

const now = new Date("2026-11-17T12:00:00Z");
const base: PortalUserInput = { isActive: true, lastLoginAt: null, mustChangePassword: false, pendingToken: null };
const future = { expiresAt: new Date("2026-11-19T12:00:00Z") };
const past = { expiresAt: new Date("2026-11-10T12:00:00Z") };

describe("portalUserStatus", () => {
  it("desactivado manda sobre todo", () => assert.equal(portalUserStatus({ ...base, isActive: false, pendingToken: future }, now).state, "disabled"));
  it("link vigente → invitado", () => assert.equal(portalUserStatus({ ...base, pendingToken: future }, now).state, "invited"));
  it("link vencido → invitación vencida", () => assert.equal(portalUserStatus({ ...base, pendingToken: past }, now).state, "invite_expired"));
  it("clave temporal", () => assert.equal(portalUserStatus({ ...base, mustChangePassword: true }, now).state, "temp_password"));
  it("ya entró → activo", () => assert.equal(portalUserStatus({ ...base, lastLoginAt: now }, now).state, "active"));
  it("con clave pero sin ingresar", () => assert.equal(portalUserStatus(base, now).state, "no_login"));
});

describe("clientPortalSummary", () => {
  it("sin usuarios", () => assert.equal(clientPortalSummary([], now).label, "Sin acceso"));
  it("cuenta solo los que pueden entrar", () =>
    assert.equal(clientPortalSummary([{ ...base, lastLoginAt: now }, { ...base, mustChangePassword: true }, { ...base, pendingToken: future }], now).label, "Con acceso (2)"));
  it("solo invitados", () => assert.equal(clientPortalSummary([{ ...base, pendingToken: future }], now).label, "Invitado"));
  it("invitación vencida", () => assert.equal(clientPortalSummary([{ ...base, pendingToken: past }], now).label, "Invitación vencida"));
  it("todos desactivados", () => assert.equal(clientPortalSummary([{ ...base, isActive: false }], now).label, "Acceso desactivado"));
});
