import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mailClaimWhere, SENDING_STALE_MS } from "./claim";

test("se reserva solo una fila reintentable o un envío colgado", () => {
  const now = Date.parse("2026-11-25T12:00:00Z");
  const where = mailClaimWhere("m1", now);
  assert.equal(where.id, "m1");
  assert.deepEqual(where.OR[0], { status: { in: ["QUEUED", "FAILED", "SKIPPED"] } });
  assert.equal((where.OR[1] as { updatedAt: { lt: Date } }).updatedAt.lt.getTime(), now - SENDING_STALE_MS);
  assert.ok(!JSON.stringify(where).includes('"SENT"'));
});

test("la cola reserva con updateMany antes de mandar", () => {
  const src = readFileSync(path.join(process.cwd(), "src/server/mail/transactional.ts"), "utf8");
  assert.match(src, /mailLog\.updateMany\(\{\s*where: mailClaimWhere\(/);
});
