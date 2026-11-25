import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoProvider } from "./demo-provider";
import { parseMessage } from "./parse";
import { parseFilters } from "@/lib/mail-viewer/search";
import { prepareViewerHtml } from "@/lib/mail-viewer/sanitize";

/**
 * Casilla simulada (sin servidor): el proveedor de ejemplo arma mensajes reales
 * con nodemailer y los lee con el mismo parser que la casilla IMAP.
 */

const provider = createDemoProvider();

test("casilla simulada: carpetas ordenadas con contadores", async () => {
  const folders = await provider.listFolders();
  assert.deepEqual(folders.slice(0, 5).map((f) => f.label), ["Recibidos", "Enviados", "Borradores", "Spam", "Papelera"]);
  const inbox = folders[0]!;
  assert.ok((inbox.total ?? 0) > 20);
  assert.ok((inbox.unseen ?? 0) > 0);
});

test("casilla simulada: búsqueda por remitente, asunto, fecha y sin leer", async () => {
  const byFrom = await provider.searchUids("INBOX", parseFilters({ q: "estudio-acustico", campo: "from" }));
  assert.equal(byFrom.length, 1);
  const summaries = await provider.summaries("INBOX", byFrom);
  assert.equal(summaries[0]!.hasAttachments, true);
  assert.equal(summaries[0]!.seen, false);
  const unread = await provider.searchUids("INBOX", parseFilters({ noLeidos: "1" }));
  const all = await provider.searchUids("INBOX", parseFilters({}));
  assert.ok(unread.length > 0 && unread.length < all.length);
  const future = await provider.searchUids("INBOX", parseFilters({ desde: "2099-01-01" }));
  assert.equal(future.length, 0);
});

test("casilla simulada: rebote detectado en el listado y destinatario leído del DSN", async () => {
  const [uid] = await provider.searchUids("INBOX", parseFilters({ q: "Undelivered", campo: "subject" }));
  const [summary] = await provider.summaries("INBOX", [uid!]);
  assert.equal(summary!.isBounce, true);
  const message = await provider.getMessage("INBOX", uid!);
  assert.deepEqual(message.detail.bounce?.recipients, ["compras@audiovisual-norte.com"]);
  assert.equal(message.detail.bounce?.status, "5.1.1");
});

test("casilla simulada: mensaje con HTML peligroso, imagen inline y adjunto PDF", async () => {
  const [uid] = await provider.searchUids("INBOX", parseFilters({ q: "planos", campo: "subject" }));
  const message = await provider.getMessage("INBOX", uid!);
  assert.equal(message.detail.hasHtml, true);
  assert.ok(message.inlineImages.has("logo-estudio"));
  const pdf = message.detail.attachments.find((a) => a.filename === "Plano sala reuniones.pdf");
  assert.ok(pdf && !pdf.inline);
  const { html, blockedImages } = prepareViewerHtml(message.html!, { allowRemoteImages: false, inlineImages: message.inlineImages });
  assert.equal(blockedImages, 2);
  assert.doesNotMatch(html, /<script|<form|javascript:|tracker\.example/i);
  assert.match(html, /data:image\/png;base64/);
  // El adjunto se baja entero por streaming.
  const file = await provider.openAttachment("INBOX", uid!, pdf!.part);
  const bytes = Buffer.from(await new Response(file.stream).arrayBuffer());
  assert.match(bytes.toString("latin1"), /^%PDF-1\.4/);
  await assert.rejects(provider.openAttachment("INBOX", uid!, "99"), /adjunto/);
});

test("casilla simulada: conversación por In-Reply-To entre Recibidos y Enviados", async () => {
  const [uid] = await provider.searchUids("INBOX", parseFilters({ q: "mferreyra", campo: "from" }));
  const message = await provider.getMessage("INBOX", uid!);
  const related = await provider.findThread(["INBOX", "INBOX.Sent"], ["<inv-1@soundtec.com.ar>"], "<re-inv-1@integradora-sur.com.ar>");
  assert.equal(message.detail.inReplyTo, "<inv-1@soundtec.com.ar>");
  assert.deepEqual(related.map((m) => m.folder).sort(), ["INBOX.Sent", "INBOX.Sent"]);
});

test("casilla simulada: abrir no marca leído; marcar leído/no leído sí", async () => {
  const [uid] = await provider.searchUids("INBOX", parseFilters({ q: "planos", campo: "subject" }));
  await provider.getMessage("INBOX", uid!);
  assert.equal((await provider.summaries("INBOX", [uid!]))[0]!.seen, false);
  await provider.setSeen("INBOX", uid!, true);
  assert.equal((await provider.summaries("INBOX", [uid!]))[0]!.seen, true);
  await provider.setSeen("INBOX", uid!, false);
  assert.equal((await provider.summaries("INBOX", [uid!]))[0]!.seen, false);
});

test("parse: mensaje demasiado grande queda marcado y sin romper", async () => {
  const raw = Buffer.from("From: a@b.com\r\nTo: portal@soundtec.com.ar\r\nSubject: Pesado\r\nMessage-ID: <p@b.com>\r\n\r\nHola");
  const parsed = await parseMessage(raw, { uid: 3, flags: new Set(["\\Seen"]), size: 30_000_000, envelope: { subject: "Pesado", from: [{ address: "A@B.com" }] } }, "INBOX", { tooLarge: true, ownAddresses: [] });
  assert.equal(parsed.detail.tooLarge, true);
  assert.equal(parsed.detail.from?.address, "a@b.com");
  assert.equal(parsed.detail.seen, true);
  assert.equal(parsed.detail.text.trim(), "Hola");
  assert.equal(parsed.html, null);
});
