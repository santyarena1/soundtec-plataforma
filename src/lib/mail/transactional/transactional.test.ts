import { test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { deliver, parsePayload, type DeliverDeps, type DeliveryConfig, type LogPatch, type OutgoingMail, type WireMessage } from "./deliver";
import { cleanDisplayName, parseHourlyLimit, parseRecipientList, planChannels, resendEnvelope, resolveReplyTo, smtpFrom } from "./envelope";
import { accessInviteMail, passwordResetMail, testMail } from "./messages";
import { renderTransactional } from "./template";

const PORTAL = "https://www.soundtecportal.com.ar";

// ── Remitente y Reply-To ─────────────────────────────────────────────────────

test("From por SMTP: siempre la casilla autenticada, con el nombre configurado", () => {
  assert.deepEqual(smtpFrom("Portal@Soundtec.com.ar", "Soundtec Portal"), { name: "Soundtec Portal", address: "portal@soundtec.com.ar" });
  // Sin nombre: el de siempre. Saltos de línea o comillas no pueden romper el encabezado.
  assert.equal(smtpFrom("portal@soundtec.com.ar", "").name, "Soundtec Portal");
  assert.equal(cleanDisplayName('Soundtec\r\nBcc: x@y.com "<'), "Soundtec Bcc: x@y.com");
});

test("Reply-To: vacío, inválido o igual a la casilla = sin encabezado; otro mail válido = se usa", () => {
  assert.equal(resolveReplyTo("", "portal@soundtec.com.ar"), undefined);
  assert.equal(resolveReplyTo("no-es-mail", "portal@soundtec.com.ar"), undefined);
  assert.equal(resolveReplyTo("PORTAL@soundtec.com.ar", "portal@soundtec.com.ar"), undefined);
  assert.equal(resolveReplyTo(" Comercial@Soundtec.com.ar ", "portal@soundtec.com.ar"), "comercial@soundtec.com.ar");
});

test("Resend de respaldo: From del dominio de Campañas y las respuestas vuelven a la casilla del portal", () => {
  assert.deepEqual(resendEnvelope({ resendFrom: "", replyTo: "", accountUser: "portal@soundtec.com.ar" }), {
    from: "Soundtec Portal <no-responder@soundtecportal.com.ar>",
    replyTo: "portal@soundtec.com.ar",
  });
  assert.equal(resendEnvelope({ replyTo: "comercial@soundtec.com.ar", accountUser: "portal@soundtec.com.ar" }).replyTo, "comercial@soundtec.com.ar");
});

// ── Selección de canal ───────────────────────────────────────────────────────

test("canal: SMTP primero; Resend solo si está habilitado como respaldo", () => {
  assert.deepEqual(planChannels({ smtpReady: true, resendReady: true, resendFallback: false, smtpBudgetLeft: 10 }).channels, ["smtp"]);
  assert.deepEqual(planChannels({ smtpReady: true, resendReady: true, resendFallback: true, smtpBudgetLeft: 10 }).channels, ["smtp", "resend"]);
  assert.deepEqual(planChannels({ smtpReady: false, resendReady: true, resendFallback: false, smtpBudgetLeft: 0 }), { channels: [], whenEmpty: "SKIPPED" });
  assert.deepEqual(planChannels({ smtpReady: false, resendReady: true, resendFallback: true, smtpBudgetLeft: 0 }).channels, ["resend"]);
});

test("canal: con el tope por hora agotado no se fuerza el SMTP (cola o Resend)", () => {
  assert.deepEqual(planChannels({ smtpReady: true, resendReady: false, resendFallback: false, smtpBudgetLeft: 0 }), { channels: [], whenEmpty: "QUEUED" });
  assert.deepEqual(planChannels({ smtpReady: true, resendReady: true, resendFallback: true, smtpBudgetLeft: 0 }).channels, ["resend"]);
});

test("tope por hora y listas de destinatarios", () => {
  assert.equal(parseHourlyLimit("150"), 150);
  assert.equal(parseHourlyLimit("0"), 200);
  assert.equal(parseHourlyLimit("abc"), 200);
  assert.deepEqual(parseRecipientList("Ana@x.com, ana@x.com; b@y.com  basura"), ["ana@x.com", "b@y.com"]);
});

// ── Envío con transporte simulado y registro ─────────────────────────────────

type Harness = { deps: DeliverDeps; logs: Map<string, LogPatch & { attempts: number }>; smtpCalls: WireMessage[]; resendCalls: WireMessage[]; copies: WireMessage[] };

function harness(config: Partial<DeliveryConfig> = {}, opts: { smtpFails?: number; resendFails?: boolean; sentLastHour?: number } = {}): Harness {
  const logs = new Map<string, LogPatch & { attempts: number }>();
  const smtpCalls: WireMessage[] = [];
  const resendCalls: WireMessage[] = [];
  const copies: WireMessage[] = [];
  let smtpFails = opts.smtpFails ?? 0;
  // Transporte real de nodemailer en modo stream: arma el mail completo sin conectarse a nada.
  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const deps: DeliverDeps = {
    config: {
      smtp: { from: smtpFrom("portal@soundtec.com.ar", "Soundtec Portal"), replyTo: resolveReplyTo("comercial@soundtec.com.ar", "portal@soundtec.com.ar") },
      resend: null,
      resendFallback: false,
      hourlyLimit: 200,
      sentCopy: true,
      ...config,
    },
    sendSmtp: async (message) => {
      smtpCalls.push(message);
      if (smtpFails > 0) {
        smtpFails -= 1;
        throw new Error("535 Incorrect authentication data");
      }
      const info = await stream.sendMail(message);
      return { messageId: info.messageId };
    },
    sendResend: async (message) => {
      resendCalls.push(message);
      if (opts.resendFails) throw new Error("Resend respondió 500");
      return { id: "re_123" };
    },
    copyToSent: async (message) => {
      copies.push(message);
    },
    smtpSentLastHour: async () => opts.sentLastHour ?? 0,
    saveLog: async (patch, id) => {
      const key = id ?? `log${logs.size + 1}`;
      logs.set(key, { ...patch, attempts: (logs.get(key)?.attempts ?? 0) + 1 });
      return key;
    },
    seal: (plain) => `sealed:${plain}`,
    now: () => new Date("2026-11-24T15:00:00Z"),
  };
  return { deps, logs, smtpCalls, resendCalls, copies };
}

const mail = (over: Partial<OutgoingMail> = {}): OutgoingMail => ({ kind: "access_invite", to: ["cliente@estudio.com"], subject: "Tu acceso", html: "<p>hola</p>", text: "hola", ...over });

test("sale por SMTP con From = casilla autenticada y Reply-To configurado; registra SENT sin guardar contenido", async () => {
  const h = harness();
  const result = await deliver(h.deps, mail());
  assert.equal(result.sent, true);
  assert.equal(result.channel, "smtp");
  assert.deepEqual(h.smtpCalls[0]!.from, { name: "Soundtec Portal", address: "portal@soundtec.com.ar" });
  assert.equal(h.smtpCalls[0]!.replyTo, "comercial@soundtec.com.ar");
  const log = h.logs.get(result.logId!)!;
  assert.equal(log.status, "SENT");
  assert.equal(log.channel, "smtp");
  assert.equal(log.payload, null);
  assert.ok(log.messageId);
  assert.equal(h.copies.length, 1, "copia en Enviados");
});

test("el mail armado por el transporte lleva From de la casilla y Reply-To aparte", async () => {
  const h = harness();
  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true });
  await deliver(h.deps, mail());
  const raw = String((await stream.sendMail(h.smtpCalls[0]!)).message);
  assert.match(raw, /^From: Soundtec Portal <portal@soundtec\.com\.ar>$/m);
  assert.match(raw, /^Reply-To: comercial@soundtec\.com\.ar$/m);
});

test("sin casilla configurada: no sale, queda SKIPPED con el contenido guardado para reintentar", async () => {
  const h = harness({ smtp: null });
  const result = await deliver(h.deps, mail());
  assert.equal(result.sent, false);
  assert.equal(result.status, "SKIPPED");
  assert.equal(h.smtpCalls.length, 0);
  const log = h.logs.get(result.logId!)!;
  assert.ok(log.payload?.startsWith("sealed:"));
  assert.deepEqual(parsePayload(log.payload!.slice("sealed:".length))?.to, ["cliente@estudio.com"]);
});

test("falla el SMTP: queda FAILED con el error; el reintento actualiza el mismo registro y suma intento", async () => {
  const h = harness({}, { smtpFails: 1 });
  const first = await deliver(h.deps, mail());
  assert.equal(first.status, "FAILED");
  assert.match(first.error!, /535/);
  assert.equal(h.logs.get(first.logId!)!.status, "FAILED");
  assert.ok(h.logs.get(first.logId!)!.payload);

  const stored = parsePayload(h.logs.get(first.logId!)!.payload!.slice("sealed:".length))!;
  const retry = await deliver(h.deps, stored, { logId: first.logId! });
  assert.equal(retry.sent, true);
  assert.equal(h.logs.size, 1);
  const log = h.logs.get(first.logId!)!;
  assert.equal(log.status, "SENT");
  assert.equal(log.attempts, 2);
  assert.equal(log.payload, null, "al salir se borra el contenido guardado");
});

test("falla el SMTP y hay respaldo: sale por Resend y queda anotado por qué", async () => {
  const h = harness({ resend: resendEnvelope({ accountUser: "portal@soundtec.com.ar" }), resendFallback: true }, { smtpFails: 1 });
  const result = await deliver(h.deps, mail());
  assert.equal(result.sent, true);
  assert.equal(result.channel, "resend");
  assert.equal(h.resendCalls[0]!.from, "Soundtec Portal <no-responder@soundtecportal.com.ar>");
  assert.match(h.logs.get(result.logId!)!.error!, /Por respaldo: SMTP/);
  assert.equal(h.copies.length, 0, "lo de Resend no se copia a la casilla");
});

test("tope por hora agotado: queda en cola (QUEUED) sin tocar el SMTP", async () => {
  const h = harness({ hourlyLimit: 5 }, { sentLastHour: 5 });
  const result = await deliver(h.deps, mail());
  assert.equal(result.status, "QUEUED");
  assert.equal(h.smtpCalls.length, 0);
  assert.ok(h.logs.get(result.logId!)!.payload);
});

test("«Olvidé mi clave»: nunca guarda el contenido ni lo copia a Enviados (el link daría acceso a la cuenta)", async () => {
  const ok = harness();
  await deliver(ok.deps, mail({ kind: "password_reset" }));
  assert.equal(ok.copies.length, 0);

  const failing = harness({}, { smtpFails: 1 });
  const result = await deliver(failing.deps, mail({ kind: "password_reset" }));
  assert.equal(result.status, "FAILED");
  assert.equal(failing.logs.get(result.logId!)!.payload, null);

  const full = harness({ hourlyLimit: 1 }, { sentLastHour: 1 });
  const queued = await deliver(full.deps, mail({ kind: "password_reset" }));
  assert.equal(queued.status, "SKIPPED", "no queda en cola: el link vence en 1 hora");
});

test("si no se puede registrar, el envío igual sale (el registro no frena el flujo)", async () => {
  const h = harness();
  h.deps.saveLog = async () => {
    throw new Error("sin base");
  };
  const result = await deliver(h.deps, mail());
  assert.equal(result.sent, true);
});

// ── Plantilla y textos ───────────────────────────────────────────────────────

test("plantilla: escapa HTML, trae texto plano y el pie con los datos de Soundtec", () => {
  const out = renderTransactional({ subject: "S", kicker: "K", title: "Hola <b>", paragraphs: ["Uno & dos"], button: { label: "Ir", url: "https://x.com/?a=1&b=2" } }, PORTAL);
  assert.match(out.html, /Hola &lt;b&gt;/);
  assert.match(out.html, /Uno &amp; dos/);
  assert.match(out.html, /href="https:\/\/x\.com\/\?a=1&amp;b=2"/);
  assert.match(out.text, /Ir: https:\/\/x\.com\/\?a=1&b=2/);
  assert.match(out.text, /4586-0400/);
  assert.match(out.text, /www\.soundtecportal\.com\.ar/);
});

test("textos: invitación al portal y recuperar clave (con doble factor)", () => {
  const invite = accessInviteMail({ name: "Ana Gómez", url: `${PORTAL}/activar/abc`, kind: "portal" }, PORTAL);
  assert.match(invite.subject, /portal de clientes/);
  assert.match(invite.text, /Hola Ana,/);
  assert.match(invite.text, /72 horas/);
  const reset = passwordResetMail({ name: "Ana", email: "ana@x.com", url: `${PORTAL}/restablecer/t`, twoFactor: true }, PORTAL);
  assert.match(reset.text, /vence en 1 hora/);
  assert.match(reset.text, /verificación en dos pasos/);
  const test1 = testMail({ sender: "portal@soundtec.com.ar", replyTo: "comercial@soundtec.com.ar", channel: "SMTP", when: new Date() }, PORTAL);
  assert.match(test1.text, /respuesta va a comercial@soundtec\.com\.ar/);
});
