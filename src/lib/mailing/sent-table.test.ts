import { test } from "node:test";
import assert from "node:assert/strict";
import { SENT_STAGE_KEYS, baseWhere, lastEvent, parseSentFilters, patchFromResend, sentWhere, stageOf, stageWhere, type SentStageKey } from "./sent-table";

const D = (s: string) => new Date(s);

test("enviados: filtros de la URL validados", () => {
  const f = parseSentFilters({ campana: "clx1234567890abcdef", estado: "opened", q: "  Ana@X.com\n", desde: "2026-11-20", hasta: "2026-11-01", pagina: "3" });
  assert.deepEqual(f, { campaignId: "clx1234567890abcdef", stage: "opened", q: "ana@x.com", from: "2026-11-01", to: "2026-11-20", page: 3 });
  const bad = parseSentFilters({ campana: "'; drop", estado: "hackeado", desde: "2026-13-01", pagina: "-1" });
  assert.deepEqual(bad, { campaignId: null, stage: null, q: "", from: null, to: null, page: 1 });
});

test("enviados: where base (solo lo que salió) con campaña, mail y fechas en hora argentina", () => {
  const where = baseWhere({ campaignId: "c1", q: "ana", from: "2026-11-01", to: "2026-11-01" });
  assert.deepEqual(where.status, { in: ["SENT", "SIMULATED", "FAILED"] });
  assert.equal(where.campaignId, "c1");
  assert.deepEqual(where.email, { contains: "ana" });
  assert.deepEqual(where.sentAt, { gte: D("2026-11-01T03:00:00Z"), lt: D("2026-11-02T03:00:00Z") });
  const withStage = sentWhere({ ...parseSentFilters({ estado: "bounced" }) });
  assert.ok(Array.isArray(withStage.AND));
});

/** Evalúa un where de stageWhere contra una fila (lo justo para probar que es excluyente). */
function matches(where: Record<string, unknown>, row: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key] ?? null;
    if (cond === null) return value === null;
    if (typeof cond === "string") return value === cond;
    const c = cond as { not?: null; notIn?: string[] };
    if ("not" in c) return value !== null;
    if (c.notIn) return !c.notIn.includes(value as string);
    throw new Error(`condición no prevista ${key}`);
  });
}

test("enviados: cada destinatario cae en un solo estado y coincide con recipientStage", () => {
  const rows: Array<Record<string, unknown> & { expect: SentStageKey }> = [
    { status: "SENT", sentAt: D("2026-11-01"), expect: "sent" },
    { status: "SENT", deliveredAt: D("2026-11-01"), expect: "delivered" },
    { status: "SENT", deliveredAt: D("2026-11-01"), openedAt: D("2026-11-02"), expect: "opened" },
    { status: "SENT", deliveredAt: D("2026-11-01"), openedAt: D("2026-11-02"), clickedAt: D("2026-11-02"), expect: "clicked" },
    { status: "SENT", bouncedAt: D("2026-11-01"), expect: "bounced" },
    { status: "SENT", deliveredAt: D("2026-11-01"), complainedAt: D("2026-11-03"), expect: "complained" },
    { status: "SENT", openedAt: D("2026-11-02"), unsubscribedAt: D("2026-11-03"), complainedAt: D("2026-11-03"), expect: "unsubscribed" },
    { status: "FAILED", expect: "failed" },
    { status: "SIMULATED", expect: "simulated" },
  ];
  const stageKey: Record<string, SentStageKey> = { sent: "sent", delivered: "delivered", opened: "opened", clicked: "clicked", bounced: "bounced", complained: "complained", unsubscribed: "unsubscribed", failed: "failed", simulated: "simulated" };
  for (const row of rows) {
    const hits = SENT_STAGE_KEYS.filter((key) => matches(stageWhere(key) as Record<string, unknown>, row));
    assert.deepEqual(hits, [row.expect], `fila ${row.expect}`);
    assert.equal(stageKey[stageOf(row as never).key], row.expect);
  }
});

test("enviados: último evento = el más reciente con su fecha", () => {
  assert.equal(lastEvent({ status: "QUEUED" }), null);
  assert.deepEqual(lastEvent({ status: "SENT", sentAt: D("2026-11-01T10:00:00Z"), deliveredAt: D("2026-11-01T10:00:05Z"), openedAt: D("2026-11-03T09:00:00Z") }), { label: "Abrió", at: D("2026-11-03T09:00:00Z") });
  // Mismo instante: gana el posterior en el embudo (clic sobre apertura).
  assert.equal(lastEvent({ status: "SENT", openedAt: D("2026-11-03T09:00:00Z"), clickedAt: D("2026-11-03T09:00:00Z") })?.label, "Clic");
  assert.equal(lastEvent({ status: "SENT", sentAt: D("2026-11-01"), bouncedAt: D("2026-11-01T00:00:01Z") })?.label, "Rebote");
});

test("traer de Resend: completa lo que falta sin pisar fechas", () => {
  const now = D("2026-11-24T12:00:00Z");
  const empty = { deliveredAt: null, openedAt: null, clickedAt: null, bouncedAt: null, complainedAt: null, status: "SENT" };
  assert.deepEqual(patchFromResend(empty, "clicked", now), { clickedAt: now, openedAt: now, deliveredAt: now });
  assert.deepEqual(patchFromResend({ ...empty, deliveredAt: D("2026-11-01") }, "opened", now), { openedAt: now });
  assert.equal(patchFromResend({ ...empty, deliveredAt: D("2026-11-01") }, "delivered", now), null);
  assert.deepEqual(patchFromResend(empty, "bounced", now), { bouncedAt: now, bounceType: "Rebote (informado por Resend)" });
  assert.deepEqual(patchFromResend(empty, "failed", now), { status: "FAILED", lastError: "Resend informa que no lo pudo mandar." });
  assert.equal(patchFromResend(empty, "sent", now), null);
  assert.equal(patchFromResend(empty, "delivery_delayed", now), null);
});
