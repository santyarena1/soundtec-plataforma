import { test } from "node:test";
import assert from "node:assert/strict";
import { describeRule } from "./compatibility-rules";

test("una regla se lee como rubro · marca · línea, con lo que tenga", () => {
  const category = { name: "Amplificadores", tangoPath: "SONIDO > AMPLIFICADORES" };
  assert.equal(describeRule({ category }), "Sonido › Amplificadores");
  assert.equal(describeRule({ category, brand: { name: "Sonance" } }), "Sonido › Amplificadores · Sonance");
  assert.equal(describeRule({ category, brand: { name: "Sonance" }, line: "Sonamp" }), "Sonido › Amplificadores · Sonance · línea Sonamp");
  assert.equal(describeRule({ brand: { name: "Blaze" } }), "Blaze");
  assert.equal(describeRule({ category: { name: "Vieja", tangoPath: null } }), "Vieja");
});
