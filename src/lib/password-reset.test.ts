import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_RESET_TTL_MS,
  RESET_LIMIT_PER_EMAIL,
  RESET_LIMIT_PER_IP,
  createResetToken,
  emailLimitKey,
  hashResetToken,
  looksLikeResetToken,
  requestPasswordResetCore,
  resetTokenState,
  type RequestResetDeps,
  type ResetUser,
} from "./password-reset";

const NOW = new Date("2026-11-24T15:00:00Z");

type World = {
  deps: RequestResetDeps;
  stored: Array<{ userId: string; tokenHash: string; expiresAt: Date }>;
  mails: Array<{ to: string; url: string }>;
  slept: number[];
};

function world(users: ResetUser[], opts: { channel?: boolean; sendFails?: boolean } = {}): World {
  const buckets = new Map<string, number>();
  const stored: World["stored"] = [];
  const mails: World["mails"] = [];
  const slept: number[] = [];
  let clock = NOW.getTime();
  const deps: RequestResetDeps = {
    channelReady: async () => opts.channel ?? true,
    consumeLimit: async (key, limit) => {
      const count = (buckets.get(key) ?? 0) + 1;
      buckets.set(key, count);
      return { ok: count <= limit };
    },
    findUser: async (email) => users.find((u) => u.email === email) ?? null,
    storeToken: async (row) => {
      // Igual que en producción: anula los links sin usar anteriores.
      for (let i = stored.length - 1; i >= 0; i--) if (stored[i]!.userId === row.userId) stored.splice(i, 1);
      stored.push(row);
    },
    sendResetMail: async (user, url) => {
      if (opts.sendFails) throw new Error("535 SMTP");
      mails.push({ to: user.email, url });
    },
    baseUrl: "https://www.soundtecportal.com.ar",
    now: () => new Date(clock),
    sleep: async (ms) => {
      slept.push(ms);
      clock += ms;
    },
    minResponseMs: 1500,
  };
  return { deps, stored, mails, slept };
}

const ana: ResetUser = { id: "u1", email: "ana@estudio.com", name: "Ana", isActive: true, twoFactorEnabled: false };
const baja: ResetUser = { id: "u2", email: "baja@estudio.com", name: "Baja", isActive: false, twoFactorEnabled: false };

test("token: 43 caracteres al azar, en la base solo el hash, vence en 1 hora", () => {
  const a = createResetToken();
  const b = createResetToken();
  assert.notEqual(a.token, b.token);
  assert.equal(a.token.length, 43);
  assert.ok(looksLikeResetToken(a.token));
  assert.equal(a.tokenHash, hashResetToken(a.token));
  assert.notEqual(a.tokenHash, a.token);
  assert.equal(PASSWORD_RESET_TTL_MS, 60 * 60 * 1000);
  assert.equal(looksLikeResetToken("../../etc"), false);
});

test("estado del link: inválido, usado, vencido (justo al cumplir la hora) o vigente", () => {
  const expiresAt = new Date(NOW.getTime() + PASSWORD_RESET_TTL_MS);
  assert.equal(resetTokenState(null, NOW), "INVALID");
  assert.equal(resetTokenState({ usedAt: NOW, expiresAt }, NOW), "USED");
  assert.equal(resetTokenState({ usedAt: null, expiresAt }, new Date(expiresAt.getTime() - 1)), "OK");
  assert.equal(resetTokenState({ usedAt: null, expiresAt }, expiresAt), "EXPIRED");
});

test("cuenta existente: guarda el hash con vencimiento de 1 h y manda el link", async () => {
  const w = world([ana]);
  const outcome = await requestPasswordResetCore(w.deps, { email: " Ana@Estudio.com ", ipHash: "ip1" });
  assert.deepEqual(outcome, { status: "accepted" });
  assert.equal(w.mails.length, 1);
  const token = w.mails[0]!.url.split("/restablecer/")[1]!;
  assert.equal(w.stored[0]!.tokenHash, hashResetToken(token));
  assert.equal(w.stored[0]!.expiresAt.getTime(), NOW.getTime() + PASSWORD_RESET_TTL_MS);
});

test("no enumera: misma respuesta y mismo tiempo mínimo exista o no la cuenta (o esté dada de baja)", async () => {
  const existing = world([ana, baja]);
  const missing = world([ana, baja]);
  const inactive = world([ana, baja]);
  const a = await requestPasswordResetCore(existing.deps, { email: "ana@estudio.com", ipHash: "ip" });
  const b = await requestPasswordResetCore(missing.deps, { email: "nadie@estudio.com", ipHash: "ip" });
  const c = await requestPasswordResetCore(inactive.deps, { email: "baja@estudio.com", ipHash: "ip" });
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  assert.equal(missing.mails.length, 0);
  assert.equal(inactive.mails.length, 0, "una cuenta desactivada no recibe link");
  for (const w of [existing, missing, inactive]) assert.equal(w.slept.reduce((s, ms) => s + ms, 0), 1500);
});

test("no enumera por tiempo: con trabajo en segundo plano, el envío lento no alarga la respuesta", async () => {
  const run = async (email: string) => {
    const w = world([ana]);
    const deferred: Array<() => Promise<void>> = [];
    // El mail tarda 3 s: si se esperara antes de responder, la cuenta real tardaría más.
    const slowSend = w.deps.sendResetMail;
    w.deps.sendResetMail = async (user, url) => {
      await w.deps.sleep(3000);
      await slowSend(user, url);
    };
    w.deps.runInBackground = (task) => {
      deferred.push(task);
    };
    const outcome = await requestPasswordResetCore(w.deps, { email, ipHash: "ip" });
    const waitedBeforeReply = w.slept.reduce((s, ms) => s + ms, 0);
    for (const task of deferred) await task();
    return { outcome, waitedBeforeReply, mails: w.mails.length };
  };
  const real = await run("ana@estudio.com");
  const fake = await run("nadie@estudio.com");
  assert.deepEqual(real.outcome, fake.outcome);
  assert.equal(real.waitedBeforeReply, 1500);
  assert.equal(fake.waitedBeforeReply, 1500);
  assert.equal(real.mails, 1, "el mail sale igual, después de responder");
  assert.equal(fake.mails, 0);
});

test("en segundo plano sin contexto (devuelve la promesa): se espera antes de responder", async () => {
  const w = world([ana]);
  w.deps.runInBackground = (task) => task();
  await requestPasswordResetCore(w.deps, { email: "ana@estudio.com", ipHash: "ip" });
  assert.equal(w.mails.length, 1);
});

test("no enumera: si el mail a una cuenta real falla, la respuesta es la misma", async () => {
  const w = world([ana], { sendFails: true });
  assert.deepEqual(await requestPasswordResetCore(w.deps, { email: "ana@estudio.com", ipHash: "ip" }), { status: "accepted" });
});

test("rate limit por mail: 3 por hora, cuenta aunque el mail no exista", async () => {
  const w = world([ana]);
  for (let i = 0; i < RESET_LIMIT_PER_EMAIL; i++) assert.equal((await requestPasswordResetCore(w.deps, { email: "nadie@x.com", ipHash: `ip${i}` })).status, "accepted");
  assert.equal((await requestPasswordResetCore(w.deps, { email: "nadie@x.com", ipHash: "otra" })).status, "limited");
});

test("rate limit por IP: 10 por hora, con mails distintos", async () => {
  const w = world([ana]);
  for (let i = 0; i < RESET_LIMIT_PER_IP; i++) await requestPasswordResetCore(w.deps, { email: `p${i}@x.com`, ipHash: "misma" });
  assert.equal((await requestPasswordResetCore(w.deps, { email: "ana@estudio.com", ipHash: "misma" })).status, "limited");
  assert.equal(w.mails.length, 0, "bloqueado no manda nada");
});

test("un pedido nuevo anula el link anterior (queda uno solo vigente)", async () => {
  const w = world([ana]);
  await requestPasswordResetCore(w.deps, { email: "ana@estudio.com", ipHash: "ip" });
  await requestPasswordResetCore(w.deps, { email: "ana@estudio.com", ipHash: "ip" });
  assert.equal(w.stored.length, 1);
  assert.equal(w.stored[0]!.tokenHash, hashResetToken(w.mails[1]!.url.split("/restablecer/")[1]!));
});

test("sin casilla de envío: lo dice igual para todos (no depende de la cuenta)", async () => {
  const w = world([ana], { channel: false });
  assert.deepEqual(await requestPasswordResetCore(w.deps, { email: "ana@estudio.com", ipHash: "ip" }), { status: "unavailable" });
  assert.deepEqual(await requestPasswordResetCore(w.deps, { email: "nadie@estudio.com", ipHash: "ip" }), { status: "unavailable" });
  assert.equal(w.mails.length, 0);
});

test("la clave del límite por mail no guarda el mail en claro", () => {
  const key = emailLimitKey("Ana@Estudio.com");
  assert.equal(key, emailLimitKey("ana@estudio.com "));
  assert.ok(!key.includes("ana"));
});
