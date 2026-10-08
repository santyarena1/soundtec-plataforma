import { test } from "node:test";
import assert from "node:assert/strict";
import { photoDimensions } from "./product-photo";

test("usa el ancho real y respeta la proporción de la foto", () => {
  const d = photoDimensions(2, { w: 40, h: null, d: 10 }, "speaker");
  assert.equal(d.width, 0.4);
  assert.equal(d.height, 0.2);
  assert.equal(d.depth, 0.1);
});

test("si solo hay alto, calcula el ancho por la foto", () => {
  const d = photoDimensions(0.5, { w: null, h: 60, d: null }, "speaker");
  assert.equal(d.height, 0.6);
  assert.equal(d.width, 0.3);
  assert.equal(d.depth, 0.05);
});

test("sin medidas usa un tamaño típico del tipo de equipo", () => {
  const d = photoDimensions(1, null, "codec");
  assert.equal(d.width, 0.44);
  assert.equal(d.height, 0.44);
});

test("acota medidas absurdas de la base", () => {
  const d = photoDimensions(1, { w: 9000, h: null, d: 500 }, "speaker");
  assert.equal(d.width, 2.5);
  assert.equal(d.depth, 0.2);
});
