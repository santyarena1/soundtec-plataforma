import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CALL_MIN_SCORE, callReasons, rankCallList, type ClientSignals } from "./call-list";
import { prioritizeInbox, relativeDays, type InboxItem } from "./inbox";
import { compareValues, comparisonText, monthToDateRanges, periodLabel, startOfDayArt } from "./periods";
import { syncHealth, syncNeedsAttention } from "./sync-health";

const NOW = new Date("2026-11-18T15:00:00.000Z"); // 12:00 en Buenos Aires
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const inHours = (n: number) => new Date(NOW.getTime() + n * 3_600_000);

function signals(over: Partial<ClientSignals>): ClientSignals {
  return {
    clientId: over.clientId ?? "c1",
    companyName: over.companyName ?? "Estudio Ruiz",
    productsViewed: 0,
    favoritesAdded: 0,
    aiQuestions: 0,
    searches: 0,
    lastLoginAt: null,
    hasOpenQuote: false,
    ...over,
  };
}

describe("Para llamar", () => {
  it("deja afuera a quien ya tiene una cotización abierta, aunque se mueva mucho", () => {
    const list = rankCallList([signals({ productsViewed: 30, favoritesAdded: 5, hasOpenQuote: true })], NOW);
    assert.equal(list.length, 0);
  });

  it("no entra con poco movimiento (debajo del mínimo)", () => {
    const list = rankCallList([signals({ productsViewed: 2, searches: 2 })], NOW);
    assert.equal(list.length, 0);
    assert.ok(2 + 1 < CALL_MIN_SCORE);
  });

  it("un favorito y una pregunta pesan más que mirar fichas", () => {
    const list = rankCallList(
      [
        signals({ clientId: "mira", companyName: "Mira Todo", productsViewed: 5 }),
        signals({ clientId: "guarda", companyName: "Guarda", favoritesAdded: 1, aiQuestions: 1 }),
      ],
      NOW
    );
    assert.deepEqual(list.map((c) => c.clientId), ["guarda", "mira"]);
  });

  it("una visita reciente suma; una vieja no", () => {
    const recent = rankCallList([signals({ productsViewed: 3, lastLoginAt: daysAgo(2) })], NOW);
    const old = rankCallList([signals({ productsViewed: 3, lastLoginAt: daysAgo(20) })], NOW);
    assert.equal(recent.length, 1);
    assert.equal(old.length, 0);
  });

  it("explica por qué, en criollo", () => {
    const reasons = callReasons(signals({ favoritesAdded: 1, aiQuestions: 2, productsViewed: 7, lastLoginAt: daysAgo(0) }), NOW);
    assert.deepEqual(reasons, ["guardó 1 favorito", "hizo 2 preguntas a Soundtec AI", "miró 7 fichas", "entró hoy"]);
  });

  it("respeta el límite y desempata por la visita más reciente", () => {
    const many = Array.from({ length: 12 }, (_, i) => signals({ clientId: `c${i}`, companyName: `C${i}`, productsViewed: 6, lastLoginAt: daysAgo(i % 7) }));
    const list = rankCallList(many, NOW, 5);
    assert.equal(list.length, 5);
    assert.ok(list[0].lastLoginAt!.getTime() >= list[1].lastLoginAt!.getTime());
  });
});

function item(over: Partial<InboxItem> & { key: string }): InboxItem {
  return { severity: "normal", count: 1, title: over.key, href: "/", actionLabel: "Ver", ...over };
}

describe("Prioridad de «Para hacer hoy»", () => {
  it("lo que está en cero no aparece", () => {
    assert.deepEqual(prioritizeInbox([item({ key: "a", count: 0 })], NOW), []);
  });

  it("ordena por severidad", () => {
    const out = prioritizeInbox([item({ key: "bajo", severity: "low" }), item({ key: "alto", severity: "high" }), item({ key: "normal" })], NOW);
    assert.deepEqual(out.map((i) => i.key), ["alto", "normal", "bajo"]);
  });

  it("lo que vence en menos de 48 horas sube a urgente", () => {
    const out = prioritizeInbox([item({ key: "solicitudes", severity: "high" }), item({ key: "cotizacion", severity: "normal", dueAt: inHours(20) })], NOW);
    assert.equal(out[0].key, "cotizacion");
    assert.equal(out[0].severity, "urgent");
  });

  it("dentro de la misma severidad, primero lo que vence antes y después lo que espera hace más", () => {
    const out = prioritizeInbox(
      [
        item({ key: "espera-corta", oldestAt: daysAgo(1) }),
        item({ key: "vence-en-5", dueAt: inHours(120) }),
        item({ key: "espera-larga", oldestAt: daysAgo(5) }),
        item({ key: "vence-en-3", dueAt: inHours(72) }),
      ],
      NOW
    );
    assert.deepEqual(out.map((i) => i.key), ["vence-en-3", "vence-en-5", "espera-larga", "espera-corta"]);
  });

  it("una espera de más de 14 días sube un escalón", () => {
    const out = prioritizeInbox([item({ key: "viejo", severity: "low", oldestAt: daysAgo(20) })], NOW);
    assert.equal(out[0].severity, "normal");
  });

  it("a igualdad de todo, más casos primero", () => {
    const out = prioritizeInbox([item({ key: "uno", count: 1 }), item({ key: "diez", count: 10 })], NOW);
    assert.deepEqual(out.map((i) => i.key), ["diez", "uno"]);
  });

  it("no modifica lo que recibe", () => {
    const input = [item({ key: "a", severity: "low", oldestAt: daysAgo(30) })];
    prioritizeInbox(input, NOW);
    assert.equal(input[0].severity, "low");
  });

  it("días relativos en hora de Buenos Aires", () => {
    assert.equal(relativeDays(inHours(2), NOW), "hoy");
    assert.equal(relativeDays(inHours(20), NOW), "mañana");
    assert.equal(relativeDays(daysAgo(3), NOW), "hace 3 días");
  });
});

describe("Comparación mes a mes", () => {
  it("mes en curso contra el mismo tramo del anterior", () => {
    const { current, previous } = monthToDateRanges(NOW);
    assert.equal(current.from.toISOString(), "2026-11-01T03:00:00.000Z");
    assert.equal(previous.from.toISOString(), "2026-10-01T03:00:00.000Z");
    assert.equal(previous.to.toISOString(), "2026-10-18T15:00:00.000Z");
    assert.equal(periodLabel(previous), "1–18 oct.");
  });

  it("si el mes anterior es más corto, no se pasa al mes actual", () => {
    const { previous, current } = monthToDateRanges(new Date("2026-03-31T20:00:00.000Z"));
    assert.ok(previous.to.getTime() <= current.from.getTime());
    assert.equal(previous.from.toISOString(), "2026-02-01T03:00:00.000Z");
  });

  it("de madrugada en Buenos Aires todavía es el día (y el mes) anterior en UTC−3", () => {
    const lateNight = new Date("2026-12-01T02:30:00.000Z"); // 30/11 23:30 en Buenos Aires
    assert.equal(monthToDateRanges(lateNight).current.from.toISOString(), "2026-11-01T03:00:00.000Z");
    assert.equal(startOfDayArt(lateNight).toISOString(), "2026-11-30T03:00:00.000Z");
  });

  it("variación y texto", () => {
    assert.deepEqual(compareValues(12, 10), { current: 12, previous: 10, delta: 2, pct: 20, trend: "up" });
    assert.equal(compareValues(5, 10).trend, "down");
    assert.equal(comparisonText(compareValues(5, 10)), "−50 % vs. mes pasado");
    assert.equal(compareValues(3, 0).pct, null);
    assert.equal(comparisonText(compareValues(3, 0)), "el mes pasado no hubo");
    assert.equal(comparisonText(compareValues(4, 4)), "igual que el mes pasado");
  });
});

describe("Estado de las sincronizaciones", () => {
  const schedule = { enabled: true, everyHours: 168 };
  const run = (over: Partial<{ status: string; startedAt: Date; error: string | null }>) => ({
    status: "COMPLETED",
    mode: "apply",
    startedAt: daysAgo(1),
    finishedAt: daysAgo(1),
    error: null,
    ...over,
  });

  it("al día si se aplicó dentro de la frecuencia", () => {
    assert.equal(syncHealth({ latest: run({}), lastAppliedAt: daysAgo(3), schedule, now: NOW }).state, "ok");
  });

  it("atrasada pasada la frecuencia más un día de margen", () => {
    const h = syncHealth({ latest: run({}), lastAppliedAt: daysAgo(9), schedule, now: NOW });
    assert.equal(h.state, "late");
    assert.ok(syncNeedsAttention(h));
  });

  it("la última corrida falló", () => {
    const h = syncHealth({ latest: run({ status: "FAILED", error: "login" }), lastAppliedAt: daysAgo(2), schedule, now: NOW });
    assert.equal(h.state, "failed");
    assert.equal(h.detail, "login");
  });

  it("corriendo hace mucho = trabada", () => {
    assert.equal(syncHealth({ latest: run({ status: "RUNNING", startedAt: inHours(-7) }), lastAppliedAt: null, schedule, now: NOW }).state, "stuck");
    assert.equal(syncHealth({ latest: run({ status: "RUNNING", startedAt: inHours(-1) }), lastAppliedAt: null, schedule, now: NOW }).state, "running");
  });

  it("apagada no avisa", () => {
    const h = syncHealth({ latest: null, lastAppliedAt: null, schedule: { enabled: false, everyHours: 168 }, now: NOW });
    assert.equal(syncNeedsAttention(h), false);
  });
});
