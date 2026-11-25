import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTimeForBatch, isDueAt, syncTickAction } from "./tick";

const weekly = { enabled: true, everyHours: 168, atHourArg: 6 };
// 09:00:05 UTC = 06 ART
const at = (iso: string) => new Date(iso).getTime();

test("semanal: a la semana justa le toca aunque la anterior haya arrancado segundos más tarde", () => {
  const last = at("2026-11-17T09:00:50Z");
  assert.equal(isDueAt(weekly, at("2026-11-24T09:00:05Z"), last), true);
});

test("semanal: no repite el mismo día ni fuera de la hora elegida", () => {
  const last = at("2026-11-24T09:00:05Z");
  assert.equal(isDueAt(weekly, at("2026-11-25T09:00:05Z"), last), false);
  assert.equal(isDueAt(weekly, at("2026-12-01T10:00:05Z"), last), false);
  assert.equal(isDueAt(weekly, at("2026-12-01T09:00:05Z"), last), true);
});

test("cada hora sin hora fija: margen chico, no corre dos veces en la misma hora", () => {
  const hourly = { enabled: true, everyHours: 1, atHourArg: null };
  assert.equal(isDueAt(hourly, at("2026-11-25T10:00:05Z"), at("2026-11-25T09:00:09Z")), true);
  assert.equal(isDueAt(hourly, at("2026-11-25T09:30:00Z"), at("2026-11-25T09:00:09Z")), false);
  assert.equal(isDueAt(hourly, at("2026-11-25T09:30:00Z"), null), true);
  assert.equal(isDueAt({ ...hourly, enabled: false }, at("2026-11-25T09:30:00Z"), null), false);
});

test("una corrida a medias se retoma en cada tick; las nuevas esperan su horario", () => {
  assert.equal(syncTickAction({ enabled: true, due: false, hasUnfinishedRun: true }), "resume");
  assert.equal(syncTickAction({ enabled: true, due: true, hasUnfinishedRun: true }), "resume");
  assert.equal(syncTickAction({ enabled: true, due: true, hasUnfinishedRun: false }), "start");
  assert.equal(syncTickAction({ enabled: true, due: false, hasUnfinishedRun: false }), "skip");
  assert.equal(syncTickAction({ enabled: false, due: true, hasUnfinishedRun: true }), "skip");
});

test("no arranca un lote que no llega a terminar antes del corte", () => {
  const deadline = 250_000;
  assert.equal(hasTimeForBatch(100_000, deadline, 20_000), true);
  assert.equal(hasTimeForBatch(210_000, deadline, 20_000), false);
  assert.equal(hasTimeForBatch(150_000, deadline, 120_000), false);
});
