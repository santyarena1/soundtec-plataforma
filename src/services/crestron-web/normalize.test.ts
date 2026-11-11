import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLengthCm } from "./normalize";

test("usa la medida métrica cuando coincide con las pulgadas", () => {
  assert.equal(parseLengthCm("17.28 in (439 mm); 19.00 in (483 mm) with rack ears"), 43.9);
  assert.equal(parseLengthCm("1.50 in (3.81 cm)"), 3.81);
});

test("«1.72 in (44 cm)» de crestron.com es un error de unidad: valen las pulgadas", () => {
  assert.equal(parseLengthCm("1.72 in (44 cm)"), 4.37);
  assert.equal(parseLengthCm("1.72 in (44 cm) without feet"), 4.37);
});

test("solo pulgadas o solo métrico", () => {
  assert.equal(parseLengthCm("2 in"), 5.08);
  assert.equal(parseLengthCm("226 mm"), 22.6);
  assert.equal(parseLengthCm(undefined), undefined);
});
