import { test } from "node:test";
import assert from "node:assert/strict";
import { keyOutBackground } from "./cutout";

function image(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set(paint(x, y), (y * w + x) * 4);
  return data;
}
const alphaAt = (d: Uint8Array, w: number, x: number, y: number) => d[(y * w + x) * 4 + 3];

test("borra el fondo blanco conectado al borde", () => {
  const src = image(5, 5, (x, y) => (x === 2 && y === 2 ? [20, 20, 20, 255] : [255, 255, 255, 255]));
  const { data, visibleRatio } = keyOutBackground(src, 5, 5);
  assert.equal(alphaAt(data, 5, 0, 0), 0);
  assert.ok(alphaAt(data, 5, 2, 2) > 0);
  assert.equal(visibleRatio, 1 / 25);
});

test("no agujerea el blanco interior de un producto blanco", () => {
  // marco gris (producto) con centro blanco, sobre fondo blanco
  const src = image(7, 7, (x, y) => {
    const ring = x >= 1 && x <= 5 && y >= 1 && y <= 5 && (x === 1 || x === 5 || y === 1 || y === 5);
    return ring ? [120, 120, 120, 255] : [255, 255, 255, 255];
  });
  const { data } = keyOutBackground(src, 7, 7);
  assert.equal(alphaAt(data, 7, 0, 0), 0);
  assert.equal(alphaAt(data, 7, 3, 3), 255);
});

test("no toca el original y respeta fondos ya transparentes", () => {
  const src = image(3, 3, (x, y) => (x === 1 && y === 1 ? [200, 0, 0, 255] : [0, 0, 0, 0]));
  const copy = new Uint8Array(src);
  const { data } = keyOutBackground(src, 3, 3);
  assert.deepEqual(src, copy);
  assert.ok(alphaAt(data, 3, 1, 1) > 0);
  assert.equal(alphaAt(data, 3, 0, 1), 0);
});

test("un color de fondo saturado no se considera fondo", () => {
  const src = image(3, 3, () => [255, 240, 200, 255]);
  const { visibleRatio } = keyOutBackground(src, 3, 3);
  assert.equal(visibleRatio, 1);
});
