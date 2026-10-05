import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACTIVITY_OPTIONS, accountRequestSchema } from "./account-request-schema";

const base = {
  fullName: "Ana Pérez", email: "ana@empresa.com", phone: "+54 11 5555-5555", company: "Empresa SA",
  cuit: "20-12345678-6", activity: "Integración AV", activityOther: "", location: "", website: "", comment: "",
};

describe("accountRequestSchema", () => {
  it("acepta un pedido completo", () => assert.equal(accountRequestSchema.safeParse(base).success, true));
  it("exige CUIT válido", () => assert.equal(accountRequestSchema.safeParse({ ...base, cuit: "20-12345678-7" }).success, false));
  it("exige texto si la actividad es Otra", () => {
    assert.equal(accountRequestSchema.safeParse({ ...base, activity: "Otra", activityOther: "" }).success, false);
    assert.equal(accountRequestSchema.safeParse({ ...base, activity: "Otra", activityOther: "Domótica" }).success, true);
  });
  it("rechaza actividad fuera de la lista", () =>
    assert.equal(accountRequestSchema.safeParse({ ...base, activity: "Cualquiera" }).success, false));
  it("normaliza mail en minúsculas y CUIT sin guiones", () => {
    const r = accountRequestSchema.parse({ ...base, email: "ANA@Empresa.com" });
    assert.equal(r.email, "ana@empresa.com");
    assert.equal(r.cuit, "20123456786");
  });
  it("lista de actividades termina en Otra", () => assert.equal(ACTIVITY_OPTIONS.at(-1), "Otra"));
});
