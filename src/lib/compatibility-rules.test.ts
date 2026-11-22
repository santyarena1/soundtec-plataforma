import { test } from "node:test";
import assert from "node:assert/strict";
import { describeRule, ruleLineMatches } from "./compatibility-rules";

test("una regla se lee como rubro · marca · línea, con lo que tenga", () => {
  const category = { name: "Amplificadores", tangoPath: "SONIDO > AMPLIFICADORES" };
  assert.equal(describeRule({ category }), "Sonido › Amplificadores");
  assert.equal(describeRule({ category, brand: { name: "Sonance" } }), "Sonido › Amplificadores · Sonance");
  assert.equal(describeRule({ category, brand: { name: "Sonance" }, line: "Sonamp" }), "Sonido › Amplificadores · Sonance · serie Sonamp");
  assert.equal(describeRule({ brand: { name: "Blaze" } }), "Blaze");
  assert.equal(describeRule({ category: { name: "Vieja", tangoPath: null } }), "Vieja");
});

test("la línea de una regla es la serie del producto, con el texto viejo `line` como respaldo", () => {
  assert.equal(ruleLineMatches("Horizon", { seriesName: "Horizon", line: null }), true);
  assert.equal(ruleLineMatches("horizon ", { seriesName: "Horizon" }), true);
  assert.equal(ruleLineMatches("Sonamp", { seriesName: null, line: "Sonamp" }), true);
  assert.equal(ruleLineMatches("Sonamp", { seriesName: "Landscape", line: "Sonamp" }), true);
  assert.equal(ruleLineMatches("Cameo", { seriesName: "Horizon", line: null }), false);
  assert.equal(ruleLineMatches(null, { seriesName: "Horizon" }), true);
});
