import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ROUNDING, parseRoundingSetting, roundPrice, tierFor, validateRoundingConfig, type PriceRoundingConfig } from "./price-rounding";

const up: PriceRoundingConfig = { ...DEFAULT_ROUNDING, enabled: true, mode: "up" };
const nearest: PriceRoundingConfig = { ...up, mode: "nearest" };

test("desactivado (o sin configuración) no toca el precio", () => {
  assert.equal(roundPrice(79.62, DEFAULT_ROUNDING), 79.62);
  assert.equal(roundPrice(79.62, null), 79.62);
  assert.equal(roundPrice(79.62, undefined), 79.62);
});

test("bordes de los tramos (hacia arriba)", () => {
  assert.equal(roundPrice(10, up), 10, "10 cae en 0–10: sin redondeo");
  assert.equal(roundPrice(9.37, up), 9.37, "0–10: sin redondeo");
  assert.equal(roundPrice(10.01, up), 10.05, "10,01 → paso 0,05");
  assert.equal(roundPrice(50, up), 50, "50 exacto es múltiplo de 0,05");
  assert.equal(roundPrice(50.01, up), 50.1, "50,01 → paso 0,10");
  assert.equal(roundPrice(300, up), 300, "300 en el tramo de 0,25, ya es múltiplo");
  assert.equal(roundPrice(300.01, up), 300.5, "300,01 → paso 0,50");
  assert.equal(roundPrice(1000, up), 1000);
  assert.equal(roundPrice(1000.01, up), 1001, "1000,01 → paso 1");
  assert.equal(roundPrice(50000, up), 50000);
  assert.equal(roundPrice(50000.4, up), 50000.4, "por encima del último tramo no se redondea");
  assert.equal(roundPrice(123456.78, up), 123456.78);
});

test("hacia arriba y al más cercano", () => {
  assert.equal(roundPrice(79.62, up), 79.7);
  assert.equal(roundPrice(79.62, nearest), 79.6);
  assert.equal(roundPrice(212.3, up), 212.5);
  assert.equal(roundPrice(212.3, nearest), 212.25);
  assert.equal(roundPrice(640.1, nearest), 640);
  assert.equal(roundPrice(640.25, nearest), 640.5, "la mitad va para arriba");
  assert.equal(roundPrice(1834.4, up), 1835);
  assert.equal(roundPrice(1834.4, nearest), 1834);
});

test("sin errores de coma flotante", () => {
  assert.equal(roundPrice(0.1 + 0.2 + 10, up), 10.3);
  assert.equal(roundPrice(24.15, up), 24.15);
  assert.equal(roundPrice(100.25, up), 100.25);
});

test("el tramo se elige por «hasta», inclusive", () => {
  assert.equal(tierFor(10, up.tiers)?.step, 0);
  assert.equal(tierFor(10.005, up.tiers)?.step, 0.05);
  assert.equal(tierFor(50000.01, up.tiers), null);
});

test("validación: superposición, hasta ≤ desde y orden", () => {
  assert.equal(validateRoundingConfig({ enabled: true, mode: "up", tiers: [{ fromUsd: 0, toUsd: 10, step: 0 }, { fromUsd: 5, toUsd: 20, step: 1 }] }).ok, false);
  assert.equal(validateRoundingConfig({ enabled: true, mode: "up", tiers: [{ fromUsd: 10, toUsd: 5, step: 1 }] }).ok, false);
  assert.equal(validateRoundingConfig({ enabled: true, mode: "raro", tiers: [] }).ok, false);
  const ok = validateRoundingConfig({ enabled: true, mode: "up", tiers: [{ fromUsd: 10.01, toUsd: 50, step: 0.05 }, { fromUsd: 0, toUsd: 10, step: 0 }] });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.config.tiers.map((t) => t.toUsd), [10, 50]);
});

test("configuración guardada rota o vacía = sin redondeo", () => {
  assert.equal(parseRoundingSetting(""), null);
  assert.equal(parseRoundingSetting("{no json"), null);
  assert.equal(parseRoundingSetting(JSON.stringify(up))?.tiers.length, 6);
});
