import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedCoverage, invalidateCoverageCache } from "./coverage-cache";

/* «Por producto» reutiliza el cálculo con los mismos filtros, lo rehace al aplicar un cambio y no guarda errores. */

test("con la misma clave se calcula una sola vez; con otra, de nuevo", async () => {
  invalidateCoverageCache();
  let calls = 0;
  const compute = async () => ++calls;
  assert.equal(await cachedCoverage("a", compute, 1_000), 1);
  assert.equal(await cachedCoverage("a", compute, 2_000), 1);
  assert.equal(await cachedCoverage("b", compute, 2_000), 2);
});

test("vence sola al minuto y se vacía al aplicar un cambio", async () => {
  invalidateCoverageCache();
  let calls = 0;
  const compute = async () => ++calls;
  await cachedCoverage("a", compute, 0);
  assert.equal(await cachedCoverage("a", compute, 59_000), 1);
  assert.equal(await cachedCoverage("a", compute, 61_000), 2);
  invalidateCoverageCache();
  assert.equal(await cachedCoverage("a", compute, 61_001), 3);
});

test("un error no queda guardado", async () => {
  invalidateCoverageCache();
  let calls = 0;
  await assert.rejects(cachedCoverage("a", async () => { calls += 1; throw new Error("base caída"); }, 0));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await cachedCoverage("a", async () => ++calls, 1), 2);
});
