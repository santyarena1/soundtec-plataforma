import { test } from "node:test";
import assert from "node:assert/strict";
import { PIXEL_HEADERS, TRANSPARENT_GIF, clickPatch, inviteOpenPixelUrl, isLinkPreviewer, openPatch, registerOpen, type OpenStore } from "./invite-tracking";
import { renderInviteEmail } from "./invite-email";

const NOW = new Date("2026-11-24T15:00:00Z");
const EARLIER = new Date("2026-11-20T10:00:00Z");

test("píxel: GIF real de 1×1 sin caché", () => {
  assert.equal(TRANSPARENT_GIF.subarray(0, 6).toString("ascii"), "GIF89a");
  assert.equal(TRANSPARENT_GIF.readUInt16LE(6), 1);
  assert.equal(TRANSPARENT_GIF.readUInt16LE(8), 1);
  assert.equal(PIXEL_HEADERS["Content-Type"], "image/gif");
  assert.match(PIXEL_HEADERS["Cache-Control"]!, /no-store/);
  assert.equal(PIXEL_HEADERS["Content-Length"], String(TRANSPARENT_GIF.length));
});

test("píxel: URL absoluta con el dominio de producción, fuera del middleware (/api)", () => {
  assert.equal(inviteOpenPixelUrl("Abc123_-xyz", "https://www.soundtecportal.com.ar"), "https://www.soundtecportal.com.ar/api/forms/open/Abc123_-xyz");
});

test("el mail de invitación lleva el píxel solo en el envío real (no en la vista previa)", () => {
  const base = { formTitle: "Evento", url: "https://x/f/t?i=c", invite: { name: "Ana" } };
  const sent = renderInviteEmail({ ...base, openPixelUrl: "https://www.soundtecportal.com.ar/api/forms/open/codigo1234" });
  assert.match(sent.html, /<img src="https:\/\/www\.soundtecportal\.com\.ar\/api\/forms\/open\/codigo1234" width="1" height="1"/);
  assert.doesNotMatch(renderInviteEmail(base).html, /\/api\/forms\/open\//);
});

function store(invite: { id: string; openedAt: Date | null; clickedAt: Date | null; sentAt: Date | null } | null) {
  const updates: Array<{ id: string; data: ReturnType<typeof openPatch> }> = [];
  const s: OpenStore = {
    find: async () => invite,
    update: async (id, data) => {
      updates.push({ id, data });
    },
  };
  return { s, updates };
}

test("apertura: la primera fija la fecha; las siguientes suman y actualizan la última", async () => {
  const first = store({ id: "i1", openedAt: null, clickedAt: null, sentAt: EARLIER });
  assert.equal(await registerOpen(first.s, "codigo1234", NOW), true);
  assert.deepEqual(first.updates[0]!.data, { openedAt: NOW, lastOpenedAt: NOW, openCount: { increment: 1 } });

  const again = store({ id: "i1", openedAt: EARLIER, clickedAt: null, sentAt: EARLIER });
  await registerOpen(again.s, "codigo1234", NOW);
  assert.deepEqual(again.updates[0]!.data, { lastOpenedAt: NOW, openCount: { increment: 1 } });
});

test("apertura: código inválido o invitación sin enviar no anotan nada", async () => {
  const notSent = store({ id: "i1", openedAt: null, clickedAt: null, sentAt: null });
  assert.equal(await registerOpen(notSent.s, "codigo1234", NOW), false);
  assert.equal(notSent.updates.length, 0);
  const bad = store({ id: "i1", openedAt: null, clickedAt: null, sentAt: EARLIER });
  assert.equal(await registerOpen(bad.s, "../../x", NOW), false);
  assert.equal(await registerOpen(bad.s, undefined, NOW), false);
  assert.equal(bad.updates.length, 0);
});

test("clic en el enlace: marca el clic y, si el píxel no llegó, también la apertura", () => {
  assert.deepEqual(clickPatch({ openedAt: null, clickedAt: null }, NOW), { openedAt: NOW, clickedAt: NOW, clickCount: { increment: 1 } });
  assert.deepEqual(clickPatch({ openedAt: EARLIER, clickedAt: null }, NOW), { clickedAt: NOW, clickCount: { increment: 1 } });
  assert.deepEqual(clickPatch({ openedAt: EARLIER, clickedAt: EARLIER }, NOW), { clickCount: { increment: 1 } });
});

test("las vistas previas de enlaces no cuentan como clic; el proxy de imágenes de Gmail no es vista previa", () => {
  assert.equal(isLinkPreviewer("WhatsApp/2.23.20.0"), true);
  assert.equal(isLinkPreviewer("Slackbot-LinkExpanding 1.0"), true);
  assert.equal(isLinkPreviewer("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), false);
  assert.equal(isLinkPreviewer("Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)"), false);
  assert.equal(isLinkPreviewer(null), false);
});
