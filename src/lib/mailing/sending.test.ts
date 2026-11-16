import { test } from "node:test";
import assert from "node:assert/strict";
import { batchIdempotencyKey, chunk, nextBatchSize, remainingToday, startOfDayArgentina, unsubscribeHeaders } from "./batches";
import { retryDelayMs, sendBatch, type FetchLike, type ResendEmail } from "./resend-client";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";
import { signSvixPayload, verifySvixSignature } from "./webhook-signature";

const email = (to: string): ResendEmail => ({ from: "Soundtec <noreply@soundtecportal.com.ar>", to: [to], subject: "Hola", html: "<p>x</p>", text: "x" });

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function mockFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, ...init });
    const next = responses.shift() ?? { status: 500 };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: { get: (name: string) => next.headers?.[name.toLowerCase()] ?? null },
      text: async () => (next.body === undefined ? "" : JSON.stringify(next.body)),
    };
  };
  return { fetchImpl, calls };
}

test("tandas: la clave de idempotencia es la misma para los mismos destinatarios en cualquier orden", () => {
  const a = batchIdempotencyKey("camp1", ["r3", "r1", "r2"]);
  assert.equal(a, batchIdempotencyKey("camp1", ["r1", "r2", "r3"]));
  assert.notEqual(a, batchIdempotencyKey("camp1", ["r1", "r2"]));
  assert.notEqual(a, batchIdempotencyKey("camp2", ["r1", "r2", "r3"]));
  assert.ok(a.length < 256);
});

test("tandas: tamaño según configuración, tope de Resend y límite diario", () => {
  assert.equal(nextBatchSize(50, Infinity), 50);
  assert.equal(nextBatchSize(500, Infinity), 100);
  assert.equal(nextBatchSize(50, 12), 12);
  assert.equal(nextBatchSize(50, 0), 0);
  assert.equal(remainingToday(300, 120), 180);
  assert.equal(remainingToday(300, 400), 0);
  assert.equal(remainingToday(0, 99999), Infinity);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("el día de envío se corta a la medianoche de Argentina", () => {
  assert.equal(startOfDayArgentina(new Date("2026-11-16T02:30:00Z")).toISOString(), "2026-11-15T03:00:00.000Z");
  assert.equal(startOfDayArgentina(new Date("2026-11-16T03:00:00Z")).toISOString(), "2026-11-16T03:00:00.000Z");
  assert.equal(startOfDayArgentina(new Date("2026-11-16T23:59:00Z")).toISOString(), "2026-11-16T03:00:00.000Z");
});

test("encabezados de baja en un clic (RFC 8058)", () => {
  const h = unsubscribeHeaders("https://x.com/api/mailing/baja?t=abc", "comercial@soundtec.com.ar");
  assert.equal(h["List-Unsubscribe"], "<https://x.com/api/mailing/baja?t=abc>, <mailto:comercial@soundtec.com.ar?subject=baja>");
  assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("Resend batch: manda la clave de idempotencia y devuelve los ids en orden", async () => {
  const { fetchImpl, calls } = mockFetch([{ status: 200, body: { data: [{ id: "e1" }, { id: "e2" }] } }]);
  const result = await sendBatch({ apiKey: "re_test", fetchImpl, sleep: async () => {} }, [email("a@a.com"), email("b@b.com")], "camp-x-123");
  assert.deepEqual(result, { ok: true, data: { ids: ["e1", "e2"] } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.resend.com/emails/batch");
  assert.equal(calls[0]!.headers["Idempotency-Key"], "camp-x-123");
  assert.equal(calls[0]!.headers.Authorization, "Bearer re_test");
  assert.equal(JSON.parse(calls[0]!.body!).length, 2);
});

test("Resend batch: ante 429 espera lo que dice Retry-After y reintenta con la misma clave", async () => {
  const waits: number[] = [];
  const { fetchImpl, calls } = mockFetch([
    { status: 429, body: { message: "Too many requests" }, headers: { "retry-after": "2" } },
    { status: 503 },
    { status: 200, body: { data: [{ id: "e1" }] } },
  ]);
  const result = await sendBatch({ apiKey: "re_test", fetchImpl, sleep: async (ms) => void waits.push(ms) }, [email("a@a.com")], "k1");
  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [2000, 2000]);
  assert.ok(calls.every((c) => c.headers["Idempotency-Key"] === "k1"));
});

test("Resend batch: un 4xx (dominio sin verificar) no se reintenta y explica el error", async () => {
  const { fetchImpl, calls } = mockFetch([{ status: 403, body: { name: "validation_error", message: "The soundtecportal.com.ar domain is not verified" } }]);
  const result = await sendBatch({ apiKey: "re_test", fetchImpl, sleep: async () => {} }, [email("a@a.com")], "k");
  assert.equal(calls.length, 1);
  assert.deepEqual(result, { ok: false, status: 403, error: "The soundtecportal.com.ar domain is not verified (validation_error)" });
});

test("Resend batch: más de 100 no se manda y una tanda vacía no llama a nadie", async () => {
  const { fetchImpl, calls } = mockFetch([]);
  const many = Array.from({ length: 101 }, (_, i) => email(`u${i}@a.com`));
  assert.equal((await sendBatch({ apiKey: "k", fetchImpl }, many, "k")).ok, false);
  assert.deepEqual(await sendBatch({ apiKey: "k", fetchImpl }, [], "k"), { ok: true, data: { ids: [] } });
  assert.equal(calls.length, 0);
});

test("espera de reintento: Retry-After en segundos o fecha, si no exponencial con tope", () => {
  assert.equal(retryDelayMs("3", 0), 3000);
  assert.equal(retryDelayMs(new Date(10_000).toUTCString(), 0, 5_000), 5000);
  assert.equal(retryDelayMs(null, 0), 1000);
  assert.equal(retryDelayMs(null, 3), 8000);
  assert.equal(retryDelayMs(null, 10), 30_000);
});

test("token de baja: ida y vuelta, y no se puede adulterar", () => {
  const secret = "clave-de-prueba-larga-para-tests";
  const token = createUnsubscribeToken({ email: " Ana@Estudio.com ", campaignId: "camp1" }, secret);
  assert.deepEqual(verifyUnsubscribeToken(token, secret), { email: "ana@estudio.com", campaignId: "camp1" });
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ e: "otro@x.com", c: "camp1" })).toString("base64url");
  assert.equal(verifyUnsubscribeToken(`${forged}.${sig}`, secret), null);
  assert.equal(verifyUnsubscribeToken(`${body}.${sig}x`, secret), null);
  assert.equal(verifyUnsubscribeToken(token, "otra-clave-distinta"), null);
  assert.equal(verifyUnsubscribeToken("basura", secret), null);
  assert.deepEqual(verifyUnsubscribeToken(createUnsubscribeToken({ email: "x@y.com" }, secret), secret), { email: "x@y.com", campaignId: null });
});

test("firma del webhook (svix): acepta la buena, rechaza adulterada, vieja o sin secreto", () => {
  const secret = `whsec_${Buffer.from("secreto-de-prueba-del-webhook").toString("base64")}`;
  const body = JSON.stringify({ type: "email.opened", data: { email_id: "e1" } });
  const now = 1_800_000_000;
  const signature = `v1,${signSvixPayload(secret, "msg_1", now, body)}`;
  const headers = { id: "msg_1", timestamp: String(now), signature };
  assert.deepEqual(verifySvixSignature(secret, headers, body, now), { ok: true });
  assert.deepEqual(verifySvixSignature(secret, { ...headers, signature: `v1,otra v1,${signSvixPayload(secret, "msg_1", now, body)}` }, body, now), { ok: true });
  assert.equal(verifySvixSignature(secret, headers, body.replace("opened", "clicked"), now).ok, false);
  assert.equal(verifySvixSignature(secret, headers, body, now + 600).ok, false);
  assert.equal(verifySvixSignature("", headers, body, now).ok, false);
  assert.equal(verifySvixSignature(secret, { ...headers, signature: null }, body, now).ok, false);
});
