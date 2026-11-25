import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { buildImapSearch, cleanSearchText, pageOfUids, parseDateParam, parseFilters, parsePart, parseUid } from "./search";
import { prepareViewerHtml, textToViewerHtml, viewerCsp } from "./sanitize";
import { bounceSeverity, isBounce, parseBounce } from "./bounce";
import { attachmentDisposition, collectAttachments, hasRealAttachments, safeFileName } from "./attachments";
import { folderLabel, resolveSpecialUse, sortFolders } from "./folders";
import { mergeThread, normalizeMessageId, normalizeSubject, splitReferences, threadLookupIds } from "./thread";
import { buildTimeline, inboxItem, inviteItems, mailLogItem, parseActivityFilters } from "./activity";
import { toMailboxError } from "./errors";
import { viewerHref } from "./links";

// ---------- Búsqueda IMAP ----------

test("búsqueda: saca CR/LF, comillas y barras (no se puede inyectar otro comando IMAP)", () => {
  assert.equal(cleanSearchText('hola"\r\nA1 DELETE INBOX\\'), "hola A1 DELETE INBOX");
  assert.equal(cleanSearchText("  x\u0000y  "), "x y");
  assert.equal(cleanSearchText(123), "");
  assert.equal(cleanSearchText("a".repeat(500)).length, 120);
});

test("búsqueda: «todo» busca en De, Para o Asunto; los campos van solos", () => {
  const f = parseFilters({ q: "  presupuesto ", campo: "all" });
  assert.deepEqual(buildImapSearch(f), { or: [{ from: "presupuesto" }, { to: "presupuesto" }, { subject: "presupuesto" }] });
  assert.deepEqual(buildImapSearch(parseFilters({ q: "x@y.com", campo: "from" })), { from: "x@y.com" });
  assert.deepEqual(buildImapSearch(parseFilters({ q: "plano", campo: "text" })), { text: "plano" });
  // Campo desconocido → «todo».
  assert.ok(buildImapSearch(parseFilters({ q: "a", campo: "header" })).or);
});

test("búsqueda: sin filtros = ALL; fechas por día con «hasta» inclusive; sin leer", () => {
  assert.deepEqual(buildImapSearch(parseFilters({})), { all: true });
  const s = buildImapSearch(parseFilters({ desde: "2026-11-01", hasta: "2026-11-24", noLeidos: "1" }));
  assert.equal(s.since?.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(s.before?.toISOString(), "2026-11-25T00:00:00.000Z");
  assert.equal(s.seen, false);
  // Invertidas se dan vuelta.
  const swapped = parseFilters({ desde: "2026-11-24", hasta: "2026-11-01" });
  assert.equal(swapped.from, "2026-11-01");
  assert.equal(swapped.to, "2026-11-24");
});

test("parámetros: fecha, UID y parte se validan", () => {
  assert.equal(parseDateParam("2026-02-30"), null);
  assert.equal(parseDateParam("2026-02-28"), "2026-02-28");
  assert.equal(parseDateParam("2026-2-1"), null);
  assert.equal(parseUid("42"), 42);
  assert.equal(parseUid("0"), null);
  assert.equal(parseUid("1:*"), null);
  assert.equal(parseUid("4294967296"), null);
  assert.equal(parseUid("12 OR 1"), null);
  assert.equal(parsePart("2.1"), "2.1");
  assert.equal(parsePart("TEXT"), null);
  assert.equal(parsePart("1.0"), null);
  assert.equal(parsePart("../1"), null);
});

test("paginado: más nuevos primero y página acotada", () => {
  const uids = Array.from({ length: 120 }, (_, i) => i + 1);
  const p1 = pageOfUids(uids, 1, 50);
  assert.equal(p1.slice[0], 120);
  assert.equal(p1.slice.length, 50);
  const last = pageOfUids(uids, 99, 50);
  assert.equal(last.page, 3);
  assert.deepEqual(last.slice, Array.from({ length: 20 }, (_, i) => 20 - i));
  assert.deepEqual(pageOfUids([], 1, 50), { slice: [], total: 0, page: 1 });
});

// ---------- Saneo del HTML ----------

const NASTY = `<html><head><meta http-equiv="refresh" content="0;url=https://evil"><link rel="stylesheet" href="https://evil/x.css"><base href="https://evil/"><style>@import url(https://evil/a.css); body{background:url('https://evil/bg.png')}</style></head>
<body onload="alert(1)"><script>alert(1)</script><iframe src="https://evil"></iframe>
<form action="https://evil/login"><input name="pass"><button>Entrar</button></form>
<a href="javascript:alert(1)">mal</a> <a href="https://bien.com/x">bien</a>
<img src="https://tracker/p.gif" onerror="alert(1)"><img src="cid:logo@x"><img src="data:image/png;base64,AAAA">
<table><tr><td background="https://evil/bg.jpg" style="background-image:url(https://evil/c.png)">x</td></tr></table>
<svg><script>alert(1)</script></svg></body></html>`;

test("saneo: sin scripts, iframes, formularios, handlers, link/meta/base ni @import", () => {
  const { html } = prepareViewerHtml(NASTY, { allowRemoteImages: false });
  const $ = cheerio.load(html);
  assert.equal($("script, iframe, form, input, button, link, base, svg, meta[http-equiv]").length, 0);
  assert.equal($("[onload], [onerror]").length, 0);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /@import/i);
  assert.doesNotMatch(html, /https:\/\/evil/);
  assert.doesNotMatch(html, /https:\/\/tracker/);
});

test("saneo: imágenes remotas bloqueadas y contadas; con permiso pasan", () => {
  const blocked = prepareViewerHtml(NASTY, { allowRemoteImages: false });
  assert.equal(blocked.blockedImages, 4); // tracker, background=, style url(), <style> url()
  const allowed = prepareViewerHtml('<img src="https://cdn.x/a.png"><p style="background:url(https://cdn.x/b.png)">x</p>', { allowRemoteImages: true });
  assert.equal(allowed.blockedImages, 0);
  assert.match(allowed.html, /https:\/\/cdn\.x\/a\.png/);
  assert.match(allowed.html, /https:\/\/cdn\.x\/b\.png/);
});

test("saneo: cid: se reemplaza por la imagen adjunta; data: de imagen queda", () => {
  const map = new Map([["logo@x", "data:image/png;base64,QUJD"]]);
  const { html } = prepareViewerHtml('<img src="cid:logo@x"><img src="cid:otra"><img src="data:image/png;base64,AAAA">', { allowRemoteImages: false, inlineImages: map });
  const $ = cheerio.load(html);
  const srcs = $("img").map((_, el) => $(el).attr("src")).get();
  assert.equal(srcs[0], "data:image/png;base64,QUJD");
  assert.match(srcs[1]!, /^data:image\/svg\+xml/);
  assert.equal(srcs[2], "data:image/png;base64,AAAA");
});

test("saneo: enlaces a pestaña nueva sin referrer", () => {
  const $ = cheerio.load(prepareViewerHtml('<a href="https://x.com">x</a><a href="mailto:a@b.com">m</a><a href="file:///etc/passwd">f</a>', { allowRemoteImages: false }).html);
  assert.equal($("a").eq(0).attr("target"), "_blank");
  assert.match($("a").eq(0).attr("rel") ?? "", /noopener/);
  assert.equal($("a").eq(1).attr("target"), "_blank");
  assert.equal($("a").eq(2).attr("href"), undefined);
});

test("texto plano: escapado y con enlaces", () => {
  const html = textToViewerHtml('<script>x</script> ver https://a.com/?q=1&b="2"');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  // La comilla corta el enlace: no se puede salir del atributo.
  assert.match(html, /<a href="https:\/\/a\.com\/\?q=1&amp;b=" target="_blank"/);
});

test("CSP del cuerpo: sin scripts ni conexiones; imágenes remotas solo si se piden", () => {
  const strict = viewerCsp(false);
  assert.match(strict, /default-src 'none'/);
  assert.doesNotMatch(strict, /script-src/);
  assert.match(strict, /img-src data:;/);
  assert.match(strict, /form-action 'none'/);
  assert.match(strict, /sandbox allow-popups/);
  assert.doesNotMatch(strict, /allow-scripts|allow-same-origin|allow-forms/);
  assert.match(viewerCsp(true), /img-src data: https: http:/);
});

// ---------- Rebotes ----------

test("rebotes: se detectan por remitente, asunto o multipart/report", () => {
  assert.ok(isBounce({ fromAddress: "MAILER-DAEMON@soundtec.com.ar", subject: "Mail delivery failed: returning message to sender" }));
  assert.ok(isBounce({ fromName: "Mail Delivery Subsystem", fromAddress: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification (Failure)" }));
  assert.ok(isBounce({ fromAddress: "postmaster@outlook.com", subject: "Undeliverable: Presupuesto" }));
  assert.ok(isBounce({ fromAddress: "x@y.com", subject: "hola", contentType: "multipart/report; report-type=delivery-status" }));
  assert.ok(isBounce({ fromAddress: "x@y.com", subject: "No se pudo entregar el mensaje" }));
  assert.ok(!isBounce({ fromAddress: "postmaster-ventas@empresa.com", subject: "Consulta" }));
  assert.ok(!isBounce({ fromAddress: "cliente@empresa.com", subject: "Re: entrega del pedido" }));
});

test("rebotes: DSN estándar (Final-Recipient, Status, Diagnostic-Code)", () => {
  const info = parseBounce({
    text: "Reporting-MTA: dns; mx\n\nFinal-Recipient: rfc822; compras@norte.com\nAction: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 <compras@norte.com>:\n Recipient address rejected: User unknown\n",
    ownAddresses: ["portal@soundtec.com.ar"],
  });
  assert.deepEqual(info.recipients, ["compras@norte.com"]);
  assert.equal(info.status, "5.1.1");
  assert.match(info.diagnostic!, /^550 5\.1\.1 <compras@norte\.com>: Recipient address rejected: User unknown$/);
  assert.equal(bounceSeverity(info), "permanent");
});

test("rebotes: texto de Exim/Postfix y X-Failed-Recipients; descarta la casilla propia", () => {
  const exim = parseBounce({
    text: "This message was created automatically by mail delivery software.\n\nA message that you sent could not be delivered to one or more of its\nrecipients. This is a permanent error. The following address(es) failed:\n\n  juan@noexiste.com.ar\n    host mx said: 550 No such user\n\nFrom: portal@soundtec.com.ar",
    ownAddresses: ["portal@soundtec.com.ar"],
  });
  assert.deepEqual(exim.recipients, ["juan@noexiste.com.ar"]);
  assert.equal(bounceSeverity(exim), "permanent");
  const header = parseBounce({ text: "", headers: { "x-failed-recipients": "Ana@Lleno.com" } });
  assert.deepEqual(header.recipients, ["ana@lleno.com"]);
  const temp = parseBounce({ text: "Status: 4.2.2\nFinal-Recipient: rfc822; full@box.com" });
  assert.equal(bounceSeverity(temp), "temporary");
});

// ---------- Adjuntos ----------

test("adjuntos: nombre seguro (sin rutas, control ni reservados) y Content-Disposition attachment", () => {
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName("C:\\x\\factura\u0000.pdf"), "factura_.pdf");
  assert.equal(safeFileName("CON.txt"), "adjunto");
  assert.equal(safeFileName(""), "adjunto");
  assert.equal(safeFileName(`${"a".repeat(200)}.pdf`).length, 120);
  assert.ok(safeFileName(`${"a".repeat(200)}.pdf`).endsWith(".pdf"));
  const cd = attachmentDisposition('Plano "sala" ñ;.pdf');
  assert.match(cd, /^attachment; filename="Plano _sala_ n_.pdf"; filename\*=UTF-8''/);
  assert.match(cd, /%C3%B1/);
  assert.doesNotMatch(cd, /\r|\n/);
});

test("adjuntos: salen de BODYSTRUCTURE con su parte; cuerpos y contenedores no cuentan", () => {
  const structure = {
    type: "multipart/mixed",
    childNodes: [
      { part: "1", type: "multipart/related", childNodes: [{ part: "1.1", type: "text/html" }, { part: "1.2", type: "image/png", id: "<logo@x>", disposition: "inline", parameters: { name: "logo.png" } }] },
      { part: "2", type: "application/pdf", disposition: "attachment", dispositionParameters: { filename: "Presupuesto.pdf" }, size: 1234 },
      { part: "3", type: "text/plain", disposition: "attachment", dispositionParameters: { filename: "notas.txt" } },
    ],
  };
  const list = collectAttachments(structure);
  assert.deepEqual(
    list.map((a) => [a.part, a.filename, a.inline, a.cid]),
    [
      ["1.2", "logo.png", true, "logo@x"],
      ["2", "Presupuesto.pdf", false, null],
      ["3", "notas.txt", false, null],
    ]
  );
  assert.ok(hasRealAttachments(structure));
  assert.ok(!hasRealAttachments({ type: "multipart/alternative", childNodes: [{ type: "text/plain" }, { type: "text/html" }] }));
  // Sin «part» del servidor se calcula por posición.
  assert.equal(collectAttachments({ type: "multipart/mixed", childNodes: [{ type: "text/plain" }, { type: "image/jpeg", disposition: "attachment" }] })[0]!.part, "2");
});

// ---------- Carpetas y conversación ----------

test("carpetas: nombres en castellano y orden Recibidos, Enviados, …, resto", () => {
  assert.equal(resolveSpecialUse("INBOX", null), "\\Inbox");
  assert.equal(resolveSpecialUse("INBOX.Sent", null), "\\Sent");
  assert.equal(resolveSpecialUse("INBOX.spam", null), "\\Junk");
  assert.equal(resolveSpecialUse("INBOX.Proveedores", null), null);
  assert.equal(folderLabel("INBOX.Trash", "\\Trash"), "Papelera");
  assert.equal(folderLabel("INBOX.Proveedores", null), "Proveedores");
  const sorted = sortFolders([
    { path: "INBOX.Zeta", label: "Zeta", specialUse: null },
    { path: "INBOX.Trash", label: "Papelera", specialUse: "\\Trash" },
    { path: "INBOX", label: "Recibidos", specialUse: "\\Inbox" },
    { path: "INBOX.Alfa", label: "Alfa", specialUse: null },
    { path: "INBOX.Sent", label: "Enviados", specialUse: "\\Sent" },
  ]);
  assert.deepEqual(sorted.map((f) => f.label), ["Recibidos", "Enviados", "Papelera", "Alfa", "Zeta"]);
});

test("conversación: ids de In-Reply-To/References normalizados, sin repetir ni el propio", () => {
  assert.equal(normalizeMessageId(" <abc@x.com>\r\n"), "<abc@x.com>");
  assert.equal(normalizeMessageId('abc"@x.com'), "<abc@x.com>");
  assert.equal(normalizeMessageId("sin-arroba"), null);
  assert.deepEqual(splitReferences("<a@x> <b@y>  <c@z>"), ["<a@x>", "<b@y>", "<c@z>"]);
  const ids = threadLookupIds({ messageId: "<me@x>", inReplyTo: "<b@y>", references: ["<a@x>", "<b@y>", "<me@x>"] });
  assert.deepEqual(ids, ["<b@y>", "<a@x>"]);
  assert.equal(normalizeSubject("RE: Rv: Fwd: Presupuesto  sala"), "presupuesto sala");
  const merged = mergeThread([
    { folder: "INBOX", uid: 2, messageId: "<b@y>", date: "2026-11-02T00:00:00Z" },
    { folder: "Sent", uid: 9, messageId: "<a@x>", date: "2026-11-01T00:00:00Z" },
    { folder: "INBOX", uid: 2, messageId: "<b@y>", date: "2026-11-02T00:00:00Z" },
  ]);
  assert.deepEqual(merged.map((m) => m.uid), [9, 2]);
});

// ---------- Actividad ----------

test("actividad: MailLog, recibidos, rebotes e invitaciones en una línea de tiempo filtrable", () => {
  const log = mailLogItem({ id: "l1", kind: "access_invite", to: "ana@x.com", subject: "Tu acceso", status: "FAILED", channel: "smtp", error: "535 auth", attempts: 3, sentAt: null, createdAt: new Date("2026-11-20T10:00:00Z") });
  assert.equal(log.type, "system");
  assert.equal(log.state, "error");
  assert.match(log.title, /Invitación de acceso — No salió/);
  assert.equal(log.meta, "por la casilla · 3 intentos");
  const ok = mailLogItem({ id: "l2", kind: "password_reset", to: "b@x.com, c@x.com", subject: "Clave", status: "SENT", channel: "smtp", error: null, attempts: 1, sentAt: new Date("2026-11-21T10:00:00Z"), createdAt: new Date("2026-11-21T09:59:00Z") });
  assert.equal(ok.href, "/admin/correo?carpeta=__sent&q=b%40x.com&campo=to");
  const bounce = inboxItem({ uid: 7, folder: "INBOX", from: { name: "", address: "mailer-daemon@x" }, subject: "Undelivered", date: "2026-11-22T10:00:00.000Z", isBounce: true, seen: false });
  assert.equal(bounce.type, "bounce");
  assert.equal(bounce.href, "/admin/correo?carpeta=INBOX&uid=7");
  const reply = inboxItem({ uid: 8, folder: "INBOX", from: { name: "Ana", address: "ana@x.com" }, subject: "RE: Tu acceso", date: "2026-11-23T10:00:00.000Z", isBounce: false, seen: true });
  assert.equal(reply.title, "Respuesta recibida");
  const inv = inviteItems({
    id: "i1",
    formId: "f1",
    formTitle: "Jornada",
    email: "z@x.com",
    status: "BOUNCED",
    sentAt: new Date("2026-11-19T10:00:00Z"),
    sendCount: 2,
    lastError: "Undelivered",
    openedAt: null,
    clickedAt: null,
    respondedAt: null,
    repliedAt: new Date("2026-11-19T12:00:00Z"),
    replySnippet: "Gracias",
    updatedAt: new Date("2026-11-19T11:00:00Z"),
  });
  assert.deepEqual(inv.map((i) => i.id.split(":")[2]), ["sent", "bounced", "replied"]);

  const all = [log, ok, bounce, reply, ...inv, log];
  const timeline = buildTimeline(all, parseActivityFilters({}));
  assert.equal(timeline.length, 7); // sin el duplicado
  assert.equal(timeline[0]!.id, reply.id); // lo más nuevo arriba
  assert.deepEqual(buildTimeline(all, parseActivityFilters({ estado: "error" })).map((i) => i.id), [bounce.id, log.id, "inv:i1:bounced"]);
  assert.deepEqual(buildTimeline(all, parseActivityFilters({ tipo: "form", q: "gracias" })).map((i) => i.id), ["inv:i1:replied"]);
  assert.equal(parseActivityFilters({ tipo: "otro", estado: "x" }).type, null);
});

test("errores de IMAP: mensaje claro sin datos de la cuenta", () => {
  const auth = toMailboxError(Object.assign(new Error("Command failed"), { authenticationFailed: true, responseText: "AUTHENTICATIONFAILED portal@soundtec.com.ar" }));
  assert.equal(auth.code, "auth");
  assert.doesNotMatch(auth.message, /portal@/);
  assert.equal(toMailboxError(Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:993"), { code: "ECONNREFUSED" })).code, "connect");
  assert.equal(toMailboxError(new Error("Socket timeout")).code, "timeout");
  assert.match(toMailboxError(new Error("raro")).message, /Configuración › Correo/);
});

test("enlaces de la bandeja: conservan carpeta y búsqueda, sacan lo vacío", () => {
  const state = { folder: "INBOX.Sent", filters: parseFilters({ q: "ana", campo: "to", desde: "2026-11-01" }), page: 2, uid: null };
  assert.equal(viewerHref(state), "/admin/correo?carpeta=INBOX.Sent&q=ana&campo=to&desde=2026-11-01&pagina=2");
  assert.equal(viewerHref(state, { uid: 5 }), "/admin/correo?carpeta=INBOX.Sent&q=ana&campo=to&desde=2026-11-01&pagina=2&uid=5");
  assert.equal(viewerHref(state, { folder: "INBOX", page: 1, filters: { q: "", from: null } }), "/admin/correo?carpeta=INBOX");
});
