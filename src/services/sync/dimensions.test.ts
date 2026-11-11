import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaceholderDimensions, realDimensionsCm } from "./dimensions";

test("1×1×1 del portal de Sonance es relleno: queda sin dato", () => {
  assert.equal(isPlaceholderDimensions({ widthCm: 1, heightCm: 1, depthCm: 1 }), true);
  assert.deepEqual(realDimensionsCm({ widthCm: 1, heightCm: 1, depthCm: 1 }), {});
});

test("todas ≤ 1 cm también es relleno", () => {
  assert.deepEqual(realDimensionsCm({ widthCm: 0.5, heightCm: 1, depthCm: 0 }), {});
  assert.deepEqual(realDimensionsCm({ widthCm: 1 }), {});
});

test("una tapa fina real (7,5 × 11,9 × 0,7) se respeta", () => {
  assert.deepEqual(realDimensionsCm({ widthCm: 7.5, heightCm: 11.9, depthCm: 0.7 }), {
    widthCm: 7.5,
    heightCm: 11.9,
    depthCm: 0.7,
  });
});

test("medidas ≤ 0 o no numéricas nunca se escriben", () => {
  assert.deepEqual(realDimensionsCm({ widthCm: 20, heightCm: 0, depthCm: Number.NaN }), {
    widthCm: 20,
    heightCm: undefined,
    depthCm: undefined,
  });
});

test("sin medidas no es relleno", () => {
  assert.equal(isPlaceholderDimensions({}), false);
  assert.deepEqual(realDimensionsCm({}), { widthCm: undefined, heightCm: undefined, depthCm: undefined });
});
