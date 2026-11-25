import { test } from "node:test";
import assert from "node:assert/strict";
import { rulesOnlyRenamed, rulesUnchanged } from "./rule-rename";

const rule = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: "6513214 · markup propio ×2.75",
  scopeType: "PRODUCT",
  scopeId: "p1",
  clientId: null,
  groupId: "grp_1",
  marginPercent: { toString: () => "175" },
  markupMultiplier: { toString: () => "2.75" },
  priority: 70,
  isActive: true,
  isExemption: false,
  notes: null,
  updatedAt: new Date("2026-11-01T00:00:00Z"),
  ...extra,
});

test("cambiar solo el nombre interno de una subregla cuenta como renombrar (se guarda directo)", () => {
  const before = [rule("a"), rule("b", { scopeId: "p2" })];
  const after = [rule("a", { name: "Cámara Umbrella · markup ×2.75", updatedAt: new Date() }), rule("b", { scopeId: "p2" })];
  assert.equal(rulesOnlyRenamed(before, after), true);
});

test("la prioridad que recalcula el guardado no impide el renombre, pero sola no es un renombre", () => {
  assert.equal(rulesOnlyRenamed([rule("a")], [rule("a", { name: "nuevo", priority: 15 })]), true);
  assert.equal(rulesOnlyRenamed([rule("a")], [rule("a", { priority: 15 })]), false);
  assert.equal(rulesOnlyRenamed([rule("a")], [rule("a", { notes: "nota" })]), false);
});

test("si además cambia el valor, el alcance o se activa/desactiva, va a revisión", () => {
  const before = [rule("a")];
  assert.equal(rulesOnlyRenamed(before, [rule("a", { name: "otro", markupMultiplier: { toString: () => "3" } })]), false);
  assert.equal(rulesOnlyRenamed(before, [rule("a", { name: "otro", scopeId: "p9" })]), false);
  assert.equal(rulesOnlyRenamed(before, [rule("a", { name: "otro", isActive: false })]), false);
});

test("sin cambios, o con reglas agregadas/borradas, no es un renombre", () => {
  assert.equal(rulesOnlyRenamed([rule("a")], [rule("a")]), false);
  assert.equal(rulesOnlyRenamed([rule("a")], [rule("a", { name: "x" }), rule("b")]), false);
  assert.equal(rulesOnlyRenamed([rule("a"), rule("b")], [rule("a", { name: "x" })]), false);
  assert.equal(rulesOnlyRenamed([rule("a")], [rule("c", { name: "x" })]), false);
});

test("guardar sin tocar nada: las reglas quedan iguales (la fecha de edición no cuenta)", () => {
  assert.equal(rulesUnchanged([rule("a"), rule("b")], [rule("a", { updatedAt: new Date() }), rule("b")]), true);
  assert.equal(rulesUnchanged([rule("a")], [rule("a", { name: "otro" })]), false);
  assert.equal(rulesUnchanged([rule("a")], [rule("a", { priority: 15 })]), false);
  assert.equal(rulesUnchanged([rule("a")], [rule("a"), rule("b")]), false);
  assert.equal(rulesUnchanged([rule("a")], [rule("c")]), false);
});
