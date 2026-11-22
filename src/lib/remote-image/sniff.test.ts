import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeHtml, sanitizeSvg, sniffImageFormat } from "./sniff";

const bytes = (...parts: Array<number[] | string>) =>
  Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p))));

test("reconoce el formato por los primeros bytes, no por la extensión", () => {
  assert.equal(sniffImageFormat(bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF")), "jpeg");
  assert.equal(sniffImageFormat(bytes([0x89], "PNG\r\n", [0x1a, 0x0a])), "png");
  assert.equal(sniffImageFormat(bytes("GIF89a", [0, 0])), "gif");
  assert.equal(sniffImageFormat(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")), "webp");
  assert.equal(sniffImageFormat(bytes([0, 0, 0, 0x1c], "ftypavif", [0, 0, 0, 0], "avifmif1")), "avif");
  assert.equal(sniffImageFormat(bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0], "mif1heic")), "heic");
  assert.equal(sniffImageFormat(bytes([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0])), "tiff");
  assert.equal(sniffImageFormat(bytes([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8])), "tiff");
  assert.equal(sniffImageFormat(bytes("BM", new Array(30).fill(0))), "bmp");
  assert.equal(sniffImageFormat(bytes([0, 0, 1, 0, 1, 0])), "ico");
});

test("reconoce SVG con BOM, <?xml?>, comentarios y DOCTYPE", () => {
  assert.equal(sniffImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), "svg");
  assert.equal(
    sniffImageFormat(Buffer.from('﻿<?xml version="1.0"?>\n<!-- logo -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg viewBox="0 0 1 1"></svg>')),
    "svg",
  );
});

test("HTML, texto y basura no son imágenes", () => {
  const html = Buffer.from("<!DOCTYPE html><html><body>Acceso denegado</body></html>");
  assert.equal(sniffImageFormat(html), null);
  assert.equal(looksLikeHtml(html), true);
  assert.equal(sniffImageFormat(Buffer.from("hola")), null);
  assert.equal(sniffImageFormat(Buffer.from([1, 2])), null);
  assert.equal(looksLikeHtml(Buffer.from([0xff, 0xd8, 0xff])), false);
});

test("sanitizeSvg saca scripts, eventos, foreignObject, entidades y referencias externas", () => {
  const dirty = `<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<script>alert(1)</script><foreignObject><iframe src="https://x"/></foreignObject>
<image href="file:///etc/passwd"/><image xlink:href="https://evil.example/a.png"/>
<use href="#ok"/><rect style="fill:url(https://evil.example/f)" fill="url(#grad)"/></svg>`;
  const clean = sanitizeSvg(dirty);
  assert.doesNotMatch(clean, /script|onload|foreignObject|ENTITY|DOCTYPE|passwd|evil\.example/i);
  assert.match(clean, /href="#ok"/);
});
