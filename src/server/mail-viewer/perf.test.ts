import { test } from "node:test";
import assert from "node:assert/strict";
import { simpleParser } from "mailparser";
import { cached, cacheStats, invalidate, peek, put } from "./cache";
import { ImapPool, isConnectionError, type PoolableClient } from "./imap-pool";
import { buildDisplayMessage, displayParts, headerLinesOf, splitHeaderFields } from "./mime-parts";
import type { StructureNode } from "@/lib/mail-viewer/attachments";

/**
 * Rendimiento del visor de correo sin servidor: caché compartida, conexiones
 * IMAP reutilizables (con un cliente falso que simula la latencia de InMotion)
 * y apertura de mails pesados trayendo solo las partes que se muestran.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cliente falso: entrar cuesta `loginRtts` idas y vueltas; cada comando, una. */
class FakeClient implements PoolableClient {
  static connects = 0;
  usable = false;
  closed = false;
  constructor(
    private readonly rtt: number,
    private readonly loginRtts = 8
  ) {}
  async connect() {
    await sleep(this.rtt * this.loginRtts);
    FakeClient.connects++;
    this.usable = true;
  }
  async command(): Promise<string> {
    if (!this.usable) throw Object.assign(new Error("Connection not available"), { code: "NoConnection" });
    await sleep(this.rtt);
    return "ok";
  }
  /** Conexión «medio cortada»: parece viva pero nada vuelve. */
  halfOpen = false;
  async noop() {
    if (this.halfOpen) return new Promise(() => undefined);
    await sleep(this.rtt);
  }
  async logout() {
    this.usable = false;
    this.closed = true;
  }
  close() {
    this.usable = false;
    this.closed = true;
  }
}

function newPool(rtt = 5, options: Partial<{ max: number; idleMs: number; operationTimeoutMs: number; checkAfterMs: number }> = {}) {
  const created: FakeClient[] = [];
  const pool = new ImapPool<FakeClient>({
    max: options.max ?? 3,
    idleMs: options.idleMs ?? 60_000,
    operationTimeoutMs: options.operationTimeoutMs ?? 5_000,
    checkAfterMs: options.checkAfterMs,
    checkTimeoutMs: 30,
    create: () => {
      const c = new FakeClient(rtt);
      created.push(c);
      return c;
    },
  });
  return { pool, created };
}

test("caché: pedidos simultáneos de la misma clave cargan una sola vez", async () => {
  let loads = 0;
  const load = async () => {
    loads++;
    await sleep(10);
    return { ok: true };
  };
  const [a, b, c] = await Promise.all([cached("t:dedupe", 1000, load), cached("t:dedupe", 1000, load), cached("t:dedupe", 1000, load)]);
  assert.equal(loads, 1);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.deepEqual(await cached("t:dedupe", 1000, load), { ok: true });
  assert.equal(loads, 1);
});

test("caché: un error no queda guardado y lo invalidado en vuelo no se guarda", async () => {
  await assert.rejects(cached("t:err", 1000, async () => Promise.reject(new Error("caída"))));
  assert.equal(await cached("t:err", 1000, async () => "bien"), "bien");
  const slow = cached("t:race", 1000, async () => {
    await sleep(10);
    return "viejo";
  });
  invalidate("t:race");
  assert.equal(await slow, "viejo");
  assert.equal(peek("t:race"), undefined);
});

test("caché: tope de memoria (saca lo menos usado) y vencimiento", async () => {
  const big = 6 * 1024 * 1024;
  for (let i = 0; i < 14; i++) put(`t:big:${i}`, 60_000, i, big);
  assert.ok(cacheStats().bytes <= 64 * 1024 * 1024);
  assert.equal(peek("t:big:0"), undefined, "lo más viejo se fue");
  assert.equal(peek("t:big:13"), 13);
  put("t:short", 1, "x");
  await sleep(5);
  assert.equal(peek("t:short"), undefined);
  invalidate("t:");
});

test("conexiones: varias acciones seguidas usan una sola entrada a la casilla", async () => {
  const { pool, created } = newPool();
  for (let i = 0; i < 6; i++) assert.equal(await pool.run((c) => c.command()), "ok");
  assert.equal(created.length, 1);
  assert.equal(pool.connectsCount, 1);
  pool.close();
});

test("conexiones: en paralelo hasta el tope; el resto espera turno", async () => {
  const { pool, created } = newPool(5, { max: 3 });
  let running = 0;
  let peak = 0;
  const op = (c: FakeClient) =>
    (async () => {
      running++;
      peak = Math.max(peak, running);
      await c.command();
      await c.command();
      running--;
      return "ok";
    })();
  const results = await Promise.all(Array.from({ length: 8 }, () => pool.run(op)));
  assert.equal(results.length, 8);
  assert.equal(created.length, 3);
  assert.equal(peak, 3);
  pool.close();
});

test("conexiones: si la reusada estaba cortada, reintenta una vez con una nueva", async () => {
  const { pool, created } = newPool();
  await pool.run((c) => c.command());
  // El servidor cortó la conexión mientras estaba libre, sin avisar.
  let first = true;
  const result = await pool.run(async (c) => {
    if (first) {
      first = false;
      c.usable = false;
      throw Object.assign(new Error("Connection not available"), { code: "NoConnection" });
    }
    return c.command();
  });
  assert.equal(result, "ok");
  assert.equal(created.length, 2);
  assert.ok(created[0]!.closed);
  pool.close();
});

test("conexiones: tras un rato quieta se prueba con NOOP; si quedó medio cortada, se abre otra sin colgar", async () => {
  const { pool, created } = newPool(2, { checkAfterMs: 20 });
  await pool.run((c) => c.command());
  await sleep(25);
  created[0]!.halfOpen = true;
  const t = performance.now();
  assert.equal(await pool.run((c) => c.command()), "ok");
  assert.ok(performance.now() - t < 1000, "no esperó al vencimiento de la operación");
  assert.equal(created.length, 2);
  assert.ok(created[0]!.closed);
  // Usada hace poco: no se prueba (sin ida y vuelta extra).
  created[1]!.halfOpen = false;
  await pool.run((c) => c.command());
  assert.equal(created.length, 2);
  pool.close();
});

test("conexiones: un error del servidor no se reintenta ni tira la conexión", async () => {
  const { pool, created } = newPool();
  const noSuchFolder = Object.assign(new Error("Mailbox doesn't exist"), { responseStatus: "NO" });
  assert.equal(isConnectionError(noSuchFolder), false);
  await assert.rejects(pool.run(async () => Promise.reject(noSuchFolder)));
  await pool.run((c) => c.command());
  assert.equal(created.length, 1);
  pool.close();
});

test("conexiones: operación colgada vence y se descarta la conexión; libre mucho tiempo se cierra", async () => {
  const { pool, created } = newPool(1, { operationTimeoutMs: 30, idleMs: 20 });
  await assert.rejects(
    pool.run(() => new Promise(() => undefined)),
    (e: Error) => /tardó demasiado/.test(e.message)
  );
  assert.ok(created[0]!.closed);
  await pool.run((c) => c.command());
  await sleep(40);
  assert.ok(created[1]!.closed, "se cerró por inactividad");
  assert.equal(pool.size.idle, 0);
  pool.close();
});

test("benchmark: 5 acciones con 20 ms por ida y vuelta, conexión por pedido vs. reusada", async () => {
  const RTT = 20;
  const actions = 5;
  const perRequest = async () => {
    const t = performance.now();
    for (let i = 0; i < actions; i++) {
      const c = new FakeClient(RTT);
      await c.connect();
      await c.command(); // EXAMINE
      await c.command(); // FETCH
      await c.command(); // LOGOUT (se esperaba)
    }
    return performance.now() - t;
  };
  const pooled = async () => {
    const { pool } = newPool(RTT);
    const t = performance.now();
    for (let i = 0; i < actions; i++) await pool.run(async (c) => (await c.command(), c.command()));
    const ms = performance.now() - t;
    pool.close();
    return ms;
  };
  const before = await perRequest();
  const after = await pooled();
  // Antes: 5 × (8 + 3) = 55 idas y vueltas; después: 8 + 5 × 2 = 18.
  assert.ok(after < before / 2.2, `antes ${before.toFixed(0)} ms, después ${after.toFixed(0)} ms`);
});

const STRUCTURE: StructureNode = {
  type: "multipart/mixed",
  childNodes: [
    {
      part: "1",
      type: "multipart/related",
      childNodes: [
        { part: "1.1", type: "multipart/alternative", childNodes: [{ part: "1.1.1", type: "text/plain", size: 40 }, { part: "1.1.2", type: "text/html", size: 120 }] },
        { part: "1.2", type: "image/png", id: "<logo@x>", size: 30, disposition: "inline" },
      ],
    },
    { part: "2", type: "application/pdf", size: 5_000_000, disposition: "attachment", dispositionParameters: { filename: "factura.pdf" } },
    { part: "3", type: "text/plain", size: 10, disposition: "attachment", dispositionParameters: { filename: "notas.txt" } },
  ],
};

test("mail pesado: se piden solo texto, HTML e imágenes del cuerpo (no el PDF)", () => {
  assert.deepEqual(displayParts(STRUCTURE), { text: ["1.1.1", "1.1.2"], images: ["1.2"], reports: [] });
  const bounce: StructureNode = {
    type: "multipart/report",
    childNodes: [
      { part: "1", type: "text/plain", size: 300 },
      { part: "2", type: "message/delivery-status", size: 400 },
      { part: "3", type: "message/rfc822", size: 3_000_000, childNodes: [{ part: "3.1", type: "text/html", size: 100 }] },
    ],
  };
  assert.deepEqual(displayParts(bounce), { text: ["1"], images: [], reports: ["2"] }, "del mail rebotado adjunto no se trae nada");
  assert.equal(displayParts({ type: "text/plain", part: "1" }), null, "no multiparte: se trae entero");
});

test("mail pesado: el mensaje armado con esas partes se lee igual que el original", async () => {
  const header = Buffer.from(
    'From: Ana <ana@x.com>\r\nTo: portal@soundtec.com.ar\r\nSubject: =?UTF-8?Q?Factura_y_cotizaci=C3=B3n?=\r\nMessage-ID: <m1@x>\r\nContent-Type: multipart/mixed;\r\n boundary="orig"\r\nMIME-Version: 1.0\r\n\r\n'
  );
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const parts = [
    { part: "1.1.1", type: "text/plain", mime: Buffer.from("Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n"), body: Buffer.from("Hola, va la cotizaci=C3=B3n.") },
    { part: "1.1.2", type: "text/html", mime: Buffer.from("Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"), body: Buffer.from('<p>Hola, va la <b>cotización</b> <img src="cid:logo@x"></p>').toString("base64") },
  ].map((p) => ({ ...p, body: Buffer.from(p.body) }));
  const images = [{ part: "1.2", type: "image/png", mime: Buffer.from("Content-Type: image/png\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <logo@x>\r\nContent-Disposition: inline\r\n\r\n"), body: Buffer.from(png.toString("base64")) }];
  const parsed = await simpleParser(buildDisplayMessage(header, parts, images));
  assert.equal(parsed.subject, "Factura y cotización");
  assert.equal(parsed.messageId, "<m1@x>");
  assert.match(String(parsed.html), /<b>cotización<\/b>/);
  assert.equal(parsed.text?.trim(), "Hola, va la cotización.");
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0]!.cid, "logo@x");
  assert.deepEqual(parsed.attachments[0]!.content, png);
  // Los encabezados que se muestran son los originales (con su Content-Type).
  const lines = headerLinesOf(header.toString("latin1"));
  assert.equal(lines.find((l) => l.key === "content-type")!.line, 'Content-Type: multipart/mixed;\r\n boundary="orig"');
  assert.equal(splitHeaderFields(header.toString("latin1")).length, 6);
});
